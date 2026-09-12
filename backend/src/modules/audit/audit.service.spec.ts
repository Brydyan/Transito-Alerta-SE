import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AuditEventEntity } from '../../entities/audit-event.entity';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { AuditService } from './audit.service';

/**
 * AUD (sc-327) — A.3/A.4/A.5: el `AuditService` tiene una sola
 * operación pública de escritura (`record`), no expone `update`
 * ni `delete`, y la escritura participa de la transacción de la
 * acción auditada (D4): si la auditoría falla, la acción se
 * revierte.
 *
 * F6 (`2026-09-11-f6-audit-logs-export`) agrega dos operaciones
 * de lectura: `list()` (paginado con filtros + LEFT JOIN a
 * `users` para resolver `actor_name`) y `exportCsv()` (stream
 * CSV batched con cap 10k). El contrato de inmutabilidad NO se
 * relaja: `list()` y `exportCsv()` son de lectura pura.
 */
describe('AuditService (AUD sc-327 — D3/D4 + F6 list/export)', () => {
  let service: AuditService;
  let repo: jest.Mocked<Repository<AuditEventEntity>>;
  let ds: { query: jest.Mock };

  beforeEach(async () => {
    ds = { query: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditEventEntity),
          useValue: {
            create: jest.fn().mockImplementation((e) => ({ ...e })),
            save: jest.fn().mockImplementation(async (e) => ({
              id: 'audit-1',
              ...e,
              createdAt: new Date(),
            })),
          },
        },
        {
          provide: DataSource,
          useValue: ds,
        },
      ],
    }).compile();

    service = moduleRef.get(AuditService);
    repo = moduleRef.get(getRepositoryToken(AuditEventEntity));
  });

  it('A.3+A.4: record() persiste el evento con todos los campos', async () => {
    const saved = await service.record({
      actorId: 'user-1',
      action: 'REVEAL',
      resourceType: 'incidents',
      resourceId: 'inc-1',
      justification: 'Denuncia por información falsa',
      metadata: { source: 'admin_panel' },
    });

    expect(repo.create).toHaveBeenCalledWith({
      actorId: 'user-1',
      action: 'REVEAL',
      resourceType: 'incidents',
      resourceId: 'inc-1',
      justification: 'Denuncia por información falsa',
      metadata: { source: 'admin_panel' },
    });
    expect(repo.save).toHaveBeenCalled();
    expect(saved.id).toBe('audit-1');
    expect(saved.action).toBe('REVEAL');
  });

  it('A.3: el servicio NO expone update ni delete', () => {
    // Garantía estructural: el servicio de auditoría NO
    // expone `update` ni `delete` — un registro de auditoría
    // editable no es un registro de auditoría (D3). F6 agrega
    // dos lectores read-only (`list`, `exportCsv`) que
    // respetan esa garantía. Si alguien añade `update` o
    // `delete`, este test falla y obliga a re-pensar la
    // inmutabilidad del registro.
    const proto = Object.getPrototypeOf(service);
    const methods = Object.getOwnPropertyNames(proto).filter(
      (m) => m !== 'constructor' && typeof (service as unknown as Record<string, unknown>)[m] === 'function',
    );
    expect(methods).not.toContain('update');
    expect(methods).not.toContain('delete');
  });

  it('A.4: record() sin manager usa el repo por defecto (sin transacción del llamador)', async () => {
    // Cuando el llamador NO pasa un `manager`, la escritura
    // usa el repo inyectado. La acción auditada ya pasó; un
    // fallo de `save` aquí no la revierte (la regla de
    // "transacción compartida" aplica SÓLO cuando el llamador
    // decide compartirla).
    await service.record({
      actorId: 'user-1',
      action: 'REVEAL',
      resourceType: 'incidents',
      resourceId: 'inc-1',
    });
    expect(repo.save).toHaveBeenCalled();
  });

  it('A.4: record() con manager usa el repo del EntityManager (transacción compartida)', async () => {
    // La acción que está siendo auditada pasa su `manager`
    // para que el INSERT de auditoría viva en la misma
    // transacción. Si el INSERT falla, la acción hace
    // rollback. La verificación: el `save` se invoca contra
    // el manager.getRepository(), NO contra `this.repo`.
    const managerEntity: AuditEventEntity = {
      id: 'audit-1',
      actor: null as unknown as AuditEventEntity['actor'],
      actorId: 'user-1',
      action: 'REVEAL',
      resourceType: 'incidents',
      resourceId: 'inc-1',
      justification: 'motivo',
      metadata: {},
      createdAt: new Date(),
    };
    const managerRepo = {
      create: jest.fn().mockImplementation((e) => ({ ...e })),
      save: jest.fn().mockResolvedValue(managerEntity),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(managerRepo),
    } as unknown as Repository<AuditEventEntity>['manager'];

    await service.record(
      {
        actorId: 'user-1',
        action: 'REVEAL',
        resourceType: 'incidents',
        resourceId: 'inc-1',
      },
      manager,
    );

    expect(manager.getRepository).toHaveBeenCalledWith(AuditEventEntity);
    expect(managerRepo.save).toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('A.5: si la escritura falla, el error se propaga (la acción NO debe quedar hecha)', async () => {
    // El contrato es "se audita lo ocurrido, no lo intentado":
    // un fallo de la auditoría es un fallo de la acción. El
    // servicio NO traga la excepción.
    repo.save.mockRejectedValueOnce(new Error('audit db down'));
    await expect(
      service.record({
        actorId: 'user-1',
        action: 'REVEAL',
        resourceType: 'incidents',
        resourceId: 'inc-1',
      }),
    ).rejects.toThrow('audit db down');
  });

  it('metadata default es {} cuando el llamador omite el campo', async () => {
    await service.record({
      actorId: 'user-1',
      action: 'REVEAL',
      resourceType: 'incidents',
      resourceId: 'inc-1',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: {} }),
    );
  });

  it('resourceId default es null cuando el llamador omite el campo', async () => {
    await service.record({
      actorId: 'user-1',
      action: 'CLEANUP',
      resourceType: 'cache',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: null }),
    );
  });

  it('justification default es null cuando el llamador omite el campo', async () => {
    // La obligatoriedad por acción se enforce en el llamador
    // (no en el servicio). El servicio acepta eventos sin
    // justification: una acción de sólo lectura podría no
    // necesitarla (D3).
    await service.record({
      actorId: 'user-1',
      action: 'READ',
      resourceType: 'incidents',
      resourceId: 'inc-1',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ justification: null }),
    );
  });

  // ───── F6 (`2026-09-11-f6-audit-logs-export`) — read layer ─────

  // Helper para construir filas crudas como las devuelve
  // `dataSource.query()`: snake_case (la columna `actor_name` viene
  // de `concat_ws(' ', users.first_name, users.last_name)`).
  function makeRow(overrides: Partial<{
    id: string;
    actor_id: string;
    actor_name: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    justification: string | null;
    metadata: Record<string, unknown>;
    created_at: Date;
  }> = {}) {
    return {
      id: 'audit-1',
      actor_id: 'user-1',
      actor_name: 'Ada Lovelace',
      action: 'REVEAL',
      resource_type: 'incidents',
      resource_id: 'inc-1',
      justification: 'case-42',
      metadata: {},
      created_at: new Date('2026-09-11T12:00:00Z'),
      ...overrides,
    };
  }

  async function collectStream(readable: import('stream').Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  // ───── list() ─────

  it('F6 R1: list() returns {items,total} resolved from the LEFT JOIN (actor_name present)', async () => {
    // Successful list for authorized user — la fila cruda tiene
    // `actor_name` resuelto por el LEFT JOIN; el DTO no la pierde.
    ds.query
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([{ total: '1' }]);

    const result = await service.list({} as AuditLogFilterDto);

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'audit-1',
      actorId: 'user-1',
      actorName: 'Ada Lovelace',
      action: 'REVEAL',
      resourceType: 'incidents',
      resourceId: 'inc-1',
      justification: 'case-42',
    });
    expect(result.items[0].createdAt).toBeInstanceOf(Date);
  });

  it('F6 R1-S2/R4-S3: list() preserves actor_name = null when the users row is missing (LEFT JOIN edge)', async () => {
    // Si el `users` row fue borrado (GDPR soft-delete), la fila
    // de auditoría sigue viva (FK ON DELETE RESTRICT en
    // `audit_events.actor_id`) y `actor_name` es explícitamente
    // null, NO undefined — la API debe serializarlo así para que
    // el cliente distinga "no resuelto" de "ausente".
    ds.query
      .mockResolvedValueOnce([makeRow({ actor_name: null })])
      .mockResolvedValueOnce([{ total: '1' }]);

    const result = await service.list({} as AuditLogFilterDto);

    expect(result.items[0].actorName).toBeNull();
  });

  it('F6 R1-S3: list() defaults page=1 and limit=20 when filters omit them', async () => {
    ds.query
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([{ total: '1' }]);

    await service.list({} as AuditLogFilterDto);

    // Dos queries: items + count. La primera lleva LIMIT/OFFSET
    // con page=1 y limit=20.
    const itemsSql = (ds.query.mock.calls[0] as [string, unknown[]])[0];
    const itemsParams = (ds.query.mock.calls[0] as [string, unknown[]])[1];
    expect(itemsSql).toContain('LIMIT');
    expect(itemsSql).toContain('OFFSET');
    // limit=20, offset=0
    expect(itemsParams).toContain(20);
    expect(itemsParams).toContain(0);
  });

  it('F6 R1-S3: list() respects explicit page=2 limit=50 (offset = 50)', async () => {
    ds.query
      .mockResolvedValueOnce([makeRow({ id: 'audit-50' })])
      .mockResolvedValueOnce([{ total: '200' }]);

    await service.list({ page: 2, limit: 50 } as AuditLogFilterDto);

    const itemsParams = (ds.query.mock.calls[0] as [string, unknown[]])[1];
    expect(itemsParams).toContain(50); // limit
    expect(itemsParams).toContain(50); // offset = (page-1)*limit
  });

  it('F6 R1-S4: list() emits a LEFT JOIN to users for actor_name', async () => {
    // El LEFT JOIN es la garantía del edge case null (R1-S1 /
    // R4-S3). Sin él, un user borrado rompe la query entera.
    ds.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: '0' }]);

    await service.list({} as AuditLogFilterDto);

    const itemsSql = (ds.query.mock.calls[0] as [string, unknown[]])[0];
    expect(itemsSql).toMatch(/LEFT\s+JOIN\s+users\s+u\s+ON\s+u\.id\s*=\s*a\.actor_id/);
  });

  it('F6 R1-S6: list() ANDs combined filters (date_from + actor_id + action)', async () => {
    ds.query
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([{ total: '1' }]);

    await service.list({
      date_from: '2026-09-01T00:00:00Z',
      actor_id: 'user-1',
      action: 'REVEAL',
    } as AuditLogFilterDto);

    const itemsSql = (ds.query.mock.calls[0] as [string, unknown[]])[0];
    expect(itemsSql).toContain('created_at >=');
    expect(itemsSql).toContain('actor_id =');
    expect(itemsSql).toContain('action =');
  });

  it('F6 R1-S7: list() with no matching records returns {items:[], total:0}', async () => {
    ds.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: '0' }]);

    const result = await service.list({
      date_from: '2020-01-01T00:00:00Z',
      date_to: '2020-01-02T00:00:00Z',
    } as AuditLogFilterDto);

    expect(result).toEqual({ items: [], total: 0 });
  });

  // ───── exportCsv() ─────

  it('F6 R3-S1: exportCsv() emits the documented header row (column order)', async () => {
    ds.query.mockResolvedValue([]);

    const stream = service.exportCsv({} as AuditLogFilterDto);
    const csv = await collectStream(stream);

    expect(csv).toContain(
      'id,actor_id,actor_name,action,resource_type,resource_id,justification,created_at',
    );
  });

  it('F6 R3-S2: exportCsv() emits one row per event with quoted actor_name + ISO date', async () => {
    ds.query
      // First batch returns 1 row, second batch empty → loop exits
      .mockResolvedValueOnce([
        makeRow({
          id: 'audit-1',
          actor_id: 'user-1',
          actor_name: 'Ada Lovelace',
          action: 'REVEAL',
          resource_type: 'incidents',
          resource_id: 'inc-1',
          justification: 'case-42',
          created_at: new Date('2026-09-11T12:00:00Z'),
        }),
      ])
      .mockResolvedValueOnce([]);

    const stream = service.exportCsv({} as AuditLogFilterDto);
    const csv = await collectStream(stream);

    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2); // 1 header + 1 row
    expect(lines[1]).toContain('audit-1');
    expect(lines[1]).toContain('user-1');
    expect(lines[1]).toContain('REVEAL');
    expect(lines[1]).toContain('inc-1');
    expect(lines[1]).toContain('2026-09-11T12:00:00.000Z');
  });

  it('F6 R3-S3: exportCsv() caps at 10,000 rows (10k cap is mandatory per design D2)', async () => {
    // Mock returns 500 rows per batch (BATCH_SIZE) for every
    // call. The loop reaches `exported === 10000` (= CAP) and
    // exits without a 21st DB call. The cap protects against
    // OOM for huge result sets.
    const batch = Array.from({ length: 500 }, (_, i) =>
      makeRow({ id: `audit-${i}` }),
    );
    ds.query.mockResolvedValue(batch);

    const stream = service.exportCsv({} as AuditLogFilterDto);
    const csv = await collectStream(stream);

    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(10001); // 1 header + 10000 rows
    // 20 batches of 500 reach 10000 exactly; the 21st call is
    // never made because the loop exits when `exported === CAP`.
    expect(ds.query.mock.calls.length).toBeLessThanOrEqual(20);
  });

  it('F6 R3-S4: exportCsv() applies the same filters as list()', async () => {
    ds.query.mockResolvedValue([]);

    await collectStream(
      service.exportCsv({
        date_from: '2026-09-01T00:00:00Z',
        date_to: '2026-09-30T23:59:59Z',
      } as AuditLogFilterDto),
    );

    const sql = (ds.query.mock.calls[0] as [string, unknown[]])[0];
    expect(sql).toContain('created_at >=');
    expect(sql).toContain('created_at <=');
  });
});
