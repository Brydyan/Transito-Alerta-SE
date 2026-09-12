import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

import { IncidentPriority, IncidentStatus } from '../../entities/incident.entity';
import { SubjectScope } from '../../common/authz/subject-scope';
import { scopeToSql } from '../../common/authz/scope-sql';

export interface IncidentRow {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  priority: IncidentPriority;
  /**
   * AUD (sc-327) D1 — `citizen_id` pasa de significar "la persona"
   * a "la autoría mostrada". En publicaciones anónimas
   * (`is_anonymous = true`) apunta a la máscara. El autor real
   * vive en `incident_reporters`. Ver la cabecera de la
   * migración 0046 y `IncidentReporterEntity`.
   */
  citizen_id: string;
  /** AUD (sc-327) D1 — `true` si la autoría se muestra sin
   * revelar al autor real. */
  is_anonymous: boolean;
  assigned_to: string | null;
  zone_id: string | null;
  geofence_matched: boolean;
  organization_id: string | null;
  category_id: string | null;
  claimed_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
  /**
   * sc-315 (D4) — motivo de cierre cuando status='closed'. Se persiste
   * en la fila de la incidencia (no sólo en status_history.notes) para
   * que un informe pueda consultarlo sin recorrido al historial.
   * NULL en cualquier otro estado. Lo garantiza `SELECT_COLUMNS`
   * (presente en `findOne`, `findAll`, `create`) y el `RETURNING` de
   * `IncidentWorkflowService.changeStatus()`.
   */
  closed_reason: string | null;
  lat: number;
  lng: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  claimed_at: Date | null;
  resolution_date: Date | null;
  follower_count: number;
  corroboration_count: number;
  is_followed_by_me: boolean;
  is_corroborated_by_me: boolean;
}

export interface CreateIncidentInput {
  title: string;
  description: string | null;
  lat: number;
  lng: number;
  priority: IncidentPriority;
  citizenId: string;
  zoneId: string | null;
  geofenceMatched: boolean;
  organizationId: string | null;
  categoryId?: string | null;
  /** AUD (sc-327) D1 — `true` para publicación anónima. */
  isAnonymous: boolean;
}

export const getSelectColumns = (actorId?: string) => `
  id, title, description, status, priority,
  citizen_id, is_anonymous,
  assigned_to, zone_id, geofence_matched, organization_id,
  category_id, claimed_by, claimed_at, approved_by, approved_at, rejected_by, rejected_at,
  rejection_reason, closed_reason, resolution_date,
  ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
  created_at, updated_at, deleted_at,
  COALESCE((SELECT COUNT(*) FROM incident_followers WHERE incident_id = incidents.id)::int, 0) AS follower_count,
  COALESCE((SELECT COUNT(*) FROM incident_corroborations WHERE incident_id = incidents.id)::int, 0) AS corroboration_count,
  EXISTS(SELECT 1 FROM incident_followers WHERE incident_id = incidents.id AND user_id = ${actorId ? `'${actorId.replace(/'/g, "''")}'::uuid` : 'NULL'}) AS is_followed_by_me,
  EXISTS(SELECT 1 FROM incident_corroborations WHERE incident_id = incidents.id AND user_id = ${actorId ? `'${actorId.replace(/'/g, "''")}'::uuid` : 'NULL'}) AS is_corroborated_by_me
`;

/**
 * IncidentsRepository (T2.1) — raw PostGIS SQL for the geometry column,
 * mirroring GeofencingRepository's isolation + parameterization convention
 * (design D4 / CC1 security hardening). ST_Point(x, y) = ST_Point(lng, lat).
 */
@Injectable()
export class IncidentsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * AUD (sc-327) FIX-1 — la rama `is_anonymous=true` de
   * `IncidentsService.create` ejecuta DOS inserts que DEBEN
   * vivir en la misma transacción: `incidents` y
   * `incident_reporters` (D2 del diseño: "una acción cuyo
   * rastro no se pudo guardar no debe quedar hecha"). Si
   * `repo.create` ejecuta la query contra `this.dataSource`,
   * la fila de `incidents` commite inmediatamente y queda
   * huérfana aunque `incident_reporters` falle.
   *
   * `runner` por defecto es `this.dataSource`; el llamador
   * puede pasar el `EntityManager` de su transacción. Mismo
   * patrón que `AuditService.record(input, manager?)`.
   */
  async create(input: CreateIncidentInput, manager?: EntityManager): Promise<IncidentRow> {
    const runner = manager ?? this.dataSource;
    const rows: IncidentRow[] = await runner.query(
      `INSERT INTO incidents
         (title, description, location, status, priority, citizen_id, is_anonymous, zone_id, geofence_matched, organization_id, category_id)
       VALUES
         ($1, $2, ST_SetSRID(ST_Point($3, $4), 4326), 'pending', $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${getSelectColumns(input.citizenId)}`,
      [
        input.title,
        input.description,
        input.lng,
        input.lat,
        input.priority,
        input.citizenId,
        input.isAnonymous,
        input.zoneId,
        input.geofenceMatched,
        input.organizationId,
        input.categoryId ?? null,
      ],
    );
    return rows[0];
  }

  /**
   * `scope` is a REQUIRED parameter (T3.2 design D3) — never optional,
   * never defaulted. An unscoped call is a compile error, not a silent
   * `global` leak.
   */
  async findAll(
    filters: { zoneId?: string; status?: IncidentStatus },
    scope: SubjectScope,
    actorId?: string
  ): Promise<IncidentRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.zoneId) {
      params.push(filters.zoneId);
      conditions.push(`zone_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }

    const scopeSql = scopeToSql(scope, { table: 'incidents', paramOffset: params.length + 1 });
    conditions.push(scopeSql.fragment);
    params.push(...scopeSql.params);

    // T6.2: always filter out soft-deleted incidents
    conditions.push('deleted_at IS NULL');

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.dataSource.query(
      `SELECT ${getSelectColumns(actorId)} FROM incidents ${where} ORDER BY created_at DESC LIMIT 1000`,
      params,
    );
  }

  async findOne(id: string, scope: SubjectScope, actorId?: string): Promise<IncidentRow | null> {
    const scopeSql = scopeToSql(scope, { table: 'incidents', paramOffset: 2 });
    const rows: IncidentRow[] = await this.dataSource.query(
      // T6.2: filter out soft-deleted incidents
      `SELECT ${getSelectColumns(actorId)} FROM incidents WHERE id = $1 AND ${scopeSql.fragment} AND deleted_at IS NULL`,
      [id, ...scopeSql.params],
    );
    return rows[0] ?? null;
  }

  /**
   * T5.6 — partial update of mutable content fields. Each field is
   * coalesced to its current value when null/undefined, so the caller
   * can send any subset. `status`, `zone_id`, `organization_id` and
   * `geofence_matched` are NEVER touched (D5).
   *
   * sc-315 C4 (ronda 2) — el viejo `updateStatus()` del repository se
   * eliminó junto con `IncidentsService.updateStatus()`. La transición
   * de estado pasó a vivir en `IncidentWorkflowService.changeStatus()`,
   * que es la única fuente que delega en la máquina de estados. Dejar
   * el gemelo aquí reintroducía el defecto 1 con cobertura falsa.
   */
  async update(
    id: string,
    values: { title: string; description: string | null; categoryId: string | null },
    actorId?: string
  ): Promise<IncidentRow> {
    const result = await this.dataSource.query(
      `UPDATE incidents
         SET title = $2,
             description = $3,
             category_id = $4
       WHERE id = $1
       RETURNING ${getSelectColumns(actorId)}`,
      [id, values.title, values.description, values.categoryId],
    );
    const row = unwrapReturningRows<IncidentRow>(result)[0];
    if (!row) {
      throw new Error(`Incident ${id} vanished mid-update`);
    }
    return row;
  }

  /** T6.2 — real soft delete: sets deleted_at = NOW() on the row. */
  async softDelete(id: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE incidents SET deleted_at = NOW() WHERE id = $1`,
      [id],
    );
  }
}

/**
 * Normalises the result of a `RETURNING` query across statement types.
 *
 * TypeORM's Postgres driver special-cases UPDATE and DELETE
 * (PostgresQueryRunner: `result.raw = [raw.rows, raw.rowCount]`) while INSERT
 * and SELECT return the rows directly. So `rows[0]` on an UPDATE yields the
 * whole row array, not the first row — which then spreads into a response
 * with no `id` or `zone_id`, silently breaking cache purging and realtime
 * event routing downstream.
 */
export function unwrapReturningRows<T>(result: unknown): T[] {
  if (!Array.isArray(result)) {
    return [];
  }
  // Tuple form: [rows, affectedCount]
  if (Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return result as T[];
}
