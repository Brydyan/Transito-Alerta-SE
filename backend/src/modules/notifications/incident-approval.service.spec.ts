import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { CommentEntity } from '../../entities/comment.entity';
import { IncidentEntity, IncidentStatus } from '../../entities/incident.entity';
import { IncidentApprovalService } from './incident-approval.service';
import { Notification, NotificationType } from './entities/notification.entity';

/**
 * sc-315 C3 (ronda 2) — `IncidentApprovalService` no tenía spec propio.
 * `notifications.controller.spec.ts` mockeaba los métodos públicos con
 * `jest.fn()`, así que ningún test ejercitaba la lógica real — y los
 * cambios de `approve()`/`reject()` (drop del cambio de `status` para
 * alinearse con la semántica ramificada de la nueva máquina) entraron
 * sin cobertura. Bajo Strict TDD eso es una violación del modo.
 *
 * Estos tests fijan el comportamiento NUEVO explícitamente: ambos
 * métodos son ahora operaciones de estampado de auditoría, no
 * transiciones de estado. Si alguien revierte esto "para devolver la
 * ruta de reject → redo", el test lo nombra.
 */

// ───────── helpers ────────────────────────────────────────────────────────

const ADMIN = 'admin-1';
const INCIDENT_ID = 'inc-1';
const NOTIF_ID = 'notif-1';

function makePendingNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: NOTIF_ID,
    user_id: ADMIN,
    incident_id: INCIDENT_ID,
    type: NotificationType.INCIDENT_PENDING_APPROVAL,
    message: 'pending review',
    data: null,
    read: false,
    processed_at: null,
    created_at: new Date(),
    ...overrides,
  } as Notification;
}

function makeResolvedIncident(overrides: Partial<IncidentEntity> = {}): IncidentEntity {
  return {
    id: INCIDENT_ID,
    title: 'Pothole',
    description: null,
    status: 'resolved' as IncidentStatus,
    priority: 'medium' as IncidentEntity['priority'],
    citizenId: 'user-1',
    assignedTo: null,
    zoneId: 'zone-1',
    geofenceMatched: true,
    organizationId: 'org-X',
    categoryId: null,
    claimedBy: 'op-1',
    claimedAt: new Date(),
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    closedReason: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    resolutionDate: new Date(),
    ...overrides,
  } as IncidentEntity;
}

/**
 * Construye un mock del `EntityManager` con la forma que el service
 * consume: `getRepository(Entidad)`, `queryRunner.query(sql, params)` y
 * `query(sql, params)`. Los tests pueden inspeccionar qué SQL corrió
 * con qué parámetros.
 */
function makeManager(opts: {
  notification: Notification | null;
  incident: IncidentEntity | null;
  existingActiveOperator?: boolean;
}) {
  const findOne = jest.fn().mockImplementation((arg: { where: { id: string } }) => {
    if (arg.where.id === NOTIF_ID) {
      return opts.notification ? Promise.resolve(opts.notification) : Promise.resolve(null);
    }
    if (arg.where.id === INCIDENT_ID) {
      return opts.incident ? Promise.resolve(opts.incident) : Promise.resolve(null);
    }
    if (arg.where.id && opts.existingActiveOperator !== undefined) {
      return opts.existingActiveOperator
        ? Promise.resolve({ id: arg.where.id, isActive: true })
        : Promise.resolve(null);
    }
    return Promise.resolve(null);
  });

  const findOneOrFail = jest
    .fn()
    .mockResolvedValue({ ...opts.incident, approvedBy: ADMIN, approvedAt: new Date() });

  const commentSave = jest.fn().mockResolvedValue({});
  const notificationUpdate = jest.fn().mockResolvedValue({});

  // Crea un query builder chainable para que
  // `markNotificationAndSiblingsProcessed` corra sin TypeError. El SQL
  // específico del sibling no es lo que estos tests cubren.
  const chainable = (): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'execute') return jest.fn().mockResolvedValue({});
          if (prop === 'getMany' || prop === 'getOne' || prop === 'getRawMany')
            return jest.fn().mockResolvedValue([]);
          return () => proxy;
        },
      },
    );
    return proxy;
  };

  const getRepository = jest.fn().mockImplementation((entity: unknown) => {
    // TypeORM pasa el constructor de la clase. Comparamos por referencia
    // — más simple y más fiel que chequear nombres.
    if (entity === Notification) {
      return {
        findOne: (q: { where: { id: string }; lock?: unknown }) =>
          findOne({ ...q, where: { id: q.where.id } }),
        update: notificationUpdate,
        createQueryBuilder: () => chainable(),
      };
    }
    if (entity === IncidentEntity) {
      return { findOne, findOneOrFail };
    }
    if (entity === CommentEntity) {
      return { save: commentSave };
    }
    // UserEntity — el service consulta la entidad por nombre de string
    // para sortear acoplamiento con sufijo "Entity" del módulo users.
    if (entity === ('UserEntity' as never)) {
      return { findOne };
    }
    return {};
  });

  const queryRunner = {
    query: jest.fn().mockResolvedValue({ rowCount: 1 }),
  };

  return {
    manager: { getRepository, queryRunner } as unknown as EntityManager,
    spies: { findOne, findOneOrFail, commentSave, notificationUpdate, queryRunner },
  };
}

function makeDataSource(manager: EntityManager) {
  return {
    transaction: jest.fn(async (cb: (m: EntityManager) => unknown) => cb(manager)),
  } as unknown as DataSource;
}

// ───────── approve ────────────────────────────────────────────────────────

describe('IncidentApprovalService.approve (sc-315 C3)', () => {
  it('stamps approved_by/at on the incident WITHOUT changing its status (D5)', async () => {
    const incident = makeResolvedIncident();
    const notification = makePendingNotification();
    const { manager, spies } = makeManager({ notification, incident });
    const dataSource = makeDataSource(manager);
    const commentRepo = { save: jest.fn() } as unknown as Repository<CommentEntity>;
    const incidentRepo = {} as unknown as Repository<IncidentEntity>;

    const module = await Test.createTestingModule({
      providers: [
        IncidentApprovalService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(IncidentEntity), useValue: incidentRepo },
        { provide: getRepositoryToken(CommentEntity), useValue: commentRepo },
      ],
    }).compile();
    const svc = module.get(IncidentApprovalService);

    const updated = await svc.approve(NOTIF_ID, ADMIN);

    // 1) El SQL del UPDATE deja `status` FUERA de la lista de columnas
    //    modificadas. Es la verificación de la decisión D5.
    const updateCall = spies.queryRunner.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('UPDATE incidents'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).not.toMatch(/SET\s+status\s*=/i);
    expect(updateCall![0]).toContain('approved_by');
    expect(updateCall![0]).toContain('approved_at');
    expect(updateCall![1]).toEqual([ADMIN, INCIDENT_ID]);

    // 2) La fila devuelta tiene approvedBy poblado (findOneOrFail
    //    mockeado arriba).
    expect(updated.approvedBy).toBe(ADMIN);

    // 3) NO se creó un Comment — la aprobación no escribe en comments.
    //    (El Comment lo escribe el reject, no el approve.)
    expect(spies.commentSave).not.toHaveBeenCalled();
  });

  it('rejects with ConflictException when the incident is not in resolved state (legacy guard)', async () => {
    const incident = makeResolvedIncident({ status: 'in_progress' });
    const notification = makePendingNotification();
    const { manager } = makeManager({ notification, incident });
    const dataSource = makeDataSource(manager);
    const incidentRepo = {} as unknown as Repository<IncidentEntity>;
    const commentRepo = { save: jest.fn() } as unknown as Repository<CommentEntity>;

    const module = await Test.createTestingModule({
      providers: [
        IncidentApprovalService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(IncidentEntity), useValue: incidentRepo },
        { provide: getRepositoryToken(CommentEntity), useValue: commentRepo },
      ],
    }).compile();
    const svc = module.get(IncidentApprovalService);

    await expect(svc.approve(NOTIF_ID, ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects with NotFoundException when the notification does not exist', async () => {
    const incident = makeResolvedIncident();
    const { manager } = makeManager({ notification: null, incident });
    const dataSource = makeDataSource(manager);
    const incidentRepo = {} as unknown as Repository<IncidentEntity>;
    const commentRepo = { save: jest.fn() } as unknown as Repository<CommentEntity>;

    const module = await Test.createTestingModule({
      providers: [
        IncidentApprovalService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(IncidentEntity), useValue: incidentRepo },
        { provide: getRepositoryToken(CommentEntity), useValue: commentRepo },
      ],
    }).compile();
    const svc = module.get(IncidentApprovalService);

    await expect(svc.approve(NOTIF_ID, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ───────── reject ─────────────────────────────────────────────────────────

describe('IncidentApprovalService.reject (sc-315 C3)', () => {
  const REASON = 'La resolución no es coherente con las fotos adjuntas';

  it('stamps rejected_by/at/reason WITHOUT reverting status (D1/D5 — resolved is terminal)', async () => {
    const incident = makeResolvedIncident();
    const notification = makePendingNotification();
    const { manager, spies } = makeManager({
      notification,
      incident,
      // El operador sigue activo. Antes el código bifurcaba la rama SQL
      // según esto. Hoy ya no: la consulta se hace por simetría con el
      // viejo flujo, pero el resultado no bifurca nada.
      existingActiveOperator: true,
    });
    const dataSource = makeDataSource(manager);
    const incidentRepo = {} as unknown as Repository<IncidentEntity>;
    const commentRepo = { save: jest.fn() } as unknown as Repository<CommentEntity>;

    const module = await Test.createTestingModule({
      providers: [
        IncidentApprovalService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(IncidentEntity), useValue: incidentRepo },
        { provide: getRepositoryToken(CommentEntity), useValue: commentRepo },
      ],
    }).compile();
    const svc = module.get(IncidentApprovalService);

    await svc.reject(NOTIF_ID, ADMIN, REASON);

    // 1) El SQL del UPDATE deja `status` y `claimed_by` FUERA. Esa es
    //    la verificación de la decisión: el rechazo es un sello de
    //    auditoría, no una reversión.
    const updateCalls = spies.queryRunner.query.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('UPDATE incidents'),
    );
    expect(updateCalls).toHaveLength(1);
    const sql = updateCalls[0][0] as string;
    expect(sql).not.toMatch(/SET\s+status\s*=/i);
    expect(sql).not.toMatch(/claimed_by\s*=\s*NULL/i);
    expect(sql).toContain('rejected_by');
    expect(sql).toContain('rejection_reason');
    expect(sql).toContain('approved_by = NULL');
    expect(updateCalls[0][1]).toEqual([ADMIN, REASON, INCIDENT_ID]);

    // 2) El Comment se persiste con la razón para la auditoría
    //    (mismo path que el flujo viejo).
    expect(spies.commentSave).toHaveBeenCalledWith({
      incidentId: INCIDENT_ID,
      userId: ADMIN,
      content: `[admin reject] ${REASON}`,
    });
  });

  it('does NOT set status to in_progress or pending — that path is dead under the new graph', async () => {
    // Este test fija la decisión de diseño explícitamente: el rechazo
    // NO devuelve la incidencia al flujo activo. Si alguien restaura
    // la rama "reject → revert", el aserto cae.
    const incident = makeResolvedIncident();
    const notification = makePendingNotification();
    const { manager, spies } = makeManager({ notification, incident });
    const dataSource = makeDataSource(manager);
    const incidentRepo = {} as unknown as Repository<IncidentEntity>;
    const commentRepo = { save: jest.fn() } as unknown as Repository<CommentEntity>;

    const module = await Test.createTestingModule({
      providers: [
        IncidentApprovalService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(IncidentEntity), useValue: incidentRepo },
        { provide: getRepositoryToken(CommentEntity), useValue: commentRepo },
      ],
    }).compile();
    const svc = module.get(IncidentApprovalService);

    await svc.reject(NOTIF_ID, ADMIN, REASON);

    const updateCalls = spies.queryRunner.query.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('UPDATE incidents'),
    );
    // El único UPDATE que toca `incidents` no menciona in_progress ni
    // pending como valores (sólo como nombres de columna de los nulls).
    for (const call of updateCalls) {
      const sql = call[0] as string;
      expect(sql).not.toMatch(/'in_progress'|'pending'/);
    }
  });

  it('rejects with ConflictException when the incident is not in resolved state', async () => {
    const incident = makeResolvedIncident({ status: 'closed' });
    const notification = makePendingNotification();
    const { manager } = makeManager({ notification, incident });
    const dataSource = makeDataSource(manager);
    const incidentRepo = {} as unknown as Repository<IncidentEntity>;
    const commentRepo = { save: jest.fn() } as unknown as Repository<CommentEntity>;

    const module = await Test.createTestingModule({
      providers: [
        IncidentApprovalService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(IncidentEntity), useValue: incidentRepo },
        { provide: getRepositoryToken(CommentEntity), useValue: commentRepo },
      ],
    }).compile();
    const svc = module.get(IncidentApprovalService);

    await expect(svc.reject(NOTIF_ID, ADMIN, REASON)).rejects.toBeInstanceOf(ConflictException);
  });
});
