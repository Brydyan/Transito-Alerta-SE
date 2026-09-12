import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Readable } from 'stream';

import { AuditEventEntity } from '../../entities/audit-event.entity';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { AuditLogItemDto } from './dto/audit-log-item.dto';

/**
 * AUD (sc-327) — D3: el `AuditService` sigue exponiendo una sola
 * operación pública de ESCRITURA: `record(...)`. No `update`, no
 * `delete`. Un registro de auditoría editable no es un registro
 * de auditoría.
 *
 * El método acepta un `manager` opcional para que el llamador
 * comparta la transacción con la acción auditada (D4). Si el
 * llamador no provee uno, se usa el `manager` por defecto del
 * repositorio — pero la práctica correcta es que TODA
 * escritura de auditoría viva dentro de la misma transacción
 * que la acción que la origina. Una acción cuyo rastro no se
 * pudo guardar no debe quedar hecha.
 *
 * F6 (`2026-09-11-f6-audit-logs-export`) — agrega dos
 * operaciones de LECTURA (`list`, `exportCsv`). La
 * inmutabilidad NO se relaja: estas funciones no escriben en
 * `audit_events` ni exponen `update`/`delete`. El contrato
 * de D3 ("append-only") se mantiene.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  /**
   * Default page size when the request omits `limit`. Hard cap
   * (100) is enforced at the DTO via `@Max(100)` — the
   * ValidationPipe rejects `?limit=200` with 400 before the
   * service runs. The cap exists so a runaway client cannot
   * pull the entire table in one request.
   */
  private static readonly DEFAULT_PAGE = 1;
  private static readonly DEFAULT_LIMIT = 20;

  /** Cap for the CSV export — design D2 / spec R3-S3. */
  private static readonly EXPORT_CAP = 10_000;

  /**
   * Batch size for the CSV streaming loop. Same value
   * `IncidentExportService.BATCH_SIZE` uses — the project
   * convention for streaming exports.
   */
  private static readonly EXPORT_BATCH_SIZE = 500;

  constructor(
    @InjectRepository(AuditEventEntity)
    private readonly repo: Repository<AuditEventEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Inserta un registro de auditoría. El `manager` opcional
   * permite compartir la transacción con la acción auditada
   * (D4). El `metadata` por defecto es `{}` — el contrato
   * es "toda metadata es opcional" y se serializa como jsonb.
   *
   * Lanza si la escritura falla. La convención es que el
   * llamador NO trague esta excepción: si el `manager` es el
   * de la transacción de la acción, la falla del INSERT
   * hace rollback de la acción. La regla de D4: "se audita
   * lo ocurrido, no lo intentado".
   */
  async record(
    input: {
      actorId: string;
      action: string;
      resourceType: string;
      resourceId?: string | null;
      justification?: string | null;
      metadata?: Record<string, unknown>;
    },
    manager?: Repository<AuditEventEntity>['manager'],
  ): Promise<AuditEventEntity> {
    const repo = manager ? manager.getRepository(AuditEventEntity) : this.repo;
    const entity = repo.create({
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      justification: input.justification ?? null,
      metadata: input.metadata ?? {},
    });
    const saved = await repo.save(entity);
    return saved;
  }

  /**
   * F6 — R1: paginated list of audit events with optional
   * filters. The query joins `users` to resolve `actor_name`;
   * LEFT JOIN so a soft-deleted user row does NOT drop the
   * audit row (per design D4 + spec R1-S1, R4-S3).
   *
   * Returns `{ items, total }`. The `total` reflects the
   * FILTERED count — the same WHERE clause is applied to
   * both the items query and the count query so the client
   * can paginate without over/under-shooting (spec R1-S5).
   *
   * Page defaults: 1-based `page` (default 1), `limit`
   * (default 20). The DTO's `@Max(100)` rejects `limit > 100`
   * with 400 before this function runs.
   */
  async list(
    filters: AuditLogFilterDto,
  ): Promise<{ items: AuditLogItemDto[]; total: number }> {
    const page = filters.page ?? AuditService.DEFAULT_PAGE;
    const limit = filters.limit ?? AuditService.DEFAULT_LIMIT;
    const offset = (page - 1) * limit;

    const { where, params } = this.buildWhere(filters);

    // Items query — joined + filtered + paginated.
    const itemsSql = `
      SELECT a.id,
             a.actor_id,
             CONCAT_WS(' ', u.first_name, u.last_name) AS actor_name,
             a.action,
             a.resource_type,
             a.resource_id,
             a.justification,
             a.metadata,
             a.created_at
        FROM audit_events a
        LEFT JOIN users u ON u.id = a.actor_id
       WHERE ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const itemsParams = [...params, limit, offset];
    const rows = await this.dataSource.query<RawAuditRow[]>(itemsSql, itemsParams);

    // Count query — same WHERE, no JOIN (count doesn't need
    // actor_name). Kept as a second query rather than a
    // windowed count to avoid changing the items projection
    // (and to keep the items query EXPLAIN-friendly).
    const countSql = `
      SELECT COUNT(*) AS total
        FROM audit_events a
       WHERE ${where}
    `;
    const countRows = await this.dataSource.query<{ total: string }[]>(
      countSql,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    return {
      items: rows.map(toItemDto),
      total,
    };
  }

  /**
   * F6 — R3: streams matching audit events as CSV. Same
   * filters as `list()`, but no pagination: capped at
   * `EXPORT_CAP` rows ordered `created_at ASC` (so the
   * oldest rows win when the dataset exceeds the cap,
   * matching the export convention used by
   * `IncidentExportService`).
   *
   * The stream emits a header row first, then one row per
   * event. Batched at `EXPORT_BATCH_SIZE` to bound memory.
   * The CSV bypasses the global `SnakeCaseResponseInterceptor`
   * because it uses `@Res()` in the controller — same
   * exception as the incident export.
   *
   * `actor_name` is resolved inline via `CONCAT_WS(' ',
   * first_name, last_name)` — null when the user row is
   * missing, kept as the empty cell in CSV. Quoting follows
   * RFC 4180: any field with `,`, `"`, `\n`, or `\r` is
   * double-quoted with `"` doubled.
   */
  exportCsv(filters: AuditLogFilterDto): Readable {
    const ds = this.dataSource;
    const cap = AuditService.EXPORT_CAP;
    const batchSize = AuditService.EXPORT_BATCH_SIZE;

    const readable = new Readable({ objectMode: false, read() {} });

    (async () => {
      readable.push(CSV_HEADER);

      let exported = 0;
      while (exported < cap) {
        const size = Math.min(batchSize, cap - exported);
        const { where, params } = this.buildWhere(filters);
        params.push(size, exported);
        const limitIdx = params.length - 1;

        const rows = await ds.query<RawAuditRow[]>(
          `SELECT a.id,
                  a.actor_id,
                  CONCAT_WS(' ', u.first_name, u.last_name) AS actor_name,
                  a.action,
                  a.resource_type,
                  a.resource_id,
                  a.justification,
                  a.created_at
             FROM audit_events a
             LEFT JOIN users u ON u.id = a.actor_id
            WHERE ${where}
            ORDER BY a.created_at ASC
            LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
          params,
        );

        if (rows.length === 0) break;

        for (const row of rows) {
          readable.push(toCsvLine(row));
        }

        exported += rows.length;
        if (rows.length < size) break;
      }

      readable.push(null);
    })().catch((err) => readable.destroy(err));

    return readable;
  }

  /**
   * ANDs the optional filters into a single WHERE clause
   * (1=1 placeholder keeps the SQL string concatenation
   * safe — every condition appends a parameter, never
   * string-interpolated user input). Shared by `list` and
   * `exportCsv` so the two endpoints never drift.
   */
  private buildWhere(filters: AuditLogFilterDto): {
    where: string;
    params: unknown[];
  } {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters.date_from) {
      params.push(filters.date_from);
      conditions.push(`a.created_at >= $${params.length}`);
    }
    if (filters.date_to) {
      params.push(filters.date_to);
      conditions.push(`a.created_at <= $${params.length}`);
    }
    if (filters.actor_id) {
      params.push(filters.actor_id);
      conditions.push(`a.actor_id = $${params.length}`);
    }
    if (filters.action) {
      params.push(filters.action);
      conditions.push(`a.action = $${params.length}`);
    }
    if (filters.resource_type) {
      params.push(filters.resource_type);
      conditions.push(`a.resource_type = $${params.length}`);
    }

    return { where: conditions.join(' AND '), params };
  }
}

// ───── helpers ─────────────────────────────────────────────────────

/**
 * Raw row shape returned by the SQL projection — snake_case
 * because Postgres keeps the source-of-truth column names.
 * `actor_name` may be null (LEFT JOIN edge case).
 */
interface RawAuditRow {
  id: string;
  actor_id: string;
  actor_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  justification: string | null;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

const CSV_HEADER =
  'id,actor_id,actor_name,action,resource_type,resource_id,justification,created_at\n';

/** Maps a raw SQL row to the camelCase DTO the controller returns. */
function toItemDto(row: RawAuditRow): AuditLogItemDto {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    justification: row.justification,
    // Items query selects metadata; export query omits it (CSV
    // header has no column for it). Default to {} so callers
    // that consume the DTO don't trip on undefined.
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

/**
 * Renders a row as a single CSV line. Quoting follows RFC
 * 4180: any field containing `,`, `"`, `\n`, or `\r` is
 * double-quoted and embedded `"` is doubled.
 */
function toCsvLine(row: RawAuditRow): string {
  return (
    [
      row.id,
      row.actor_id,
      csvCell(row.actor_name),
      row.action,
      row.resource_type,
      row.resource_id ?? '',
      csvCell(row.justification),
      row.created_at.toISOString(),
    ].join(',') + '\n'
  );
}

function csvCell(value: string | null): string {
  if (value === null || value === undefined) return '';
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
