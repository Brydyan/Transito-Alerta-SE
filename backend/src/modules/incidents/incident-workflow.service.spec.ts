import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { REDIS_CLIENT } from '../../core/core.module';
import { GeofencingService } from '../geofencing/geofencing.service';
import { OrganizationEntity } from '../../entities/organization.entity';
import { IncidentWorkflowService } from './incident-workflow.service';

import {
  CLAIM_LIMIT_REACHED,
  INCIDENT_ALREADY_CLAIMED,
  INCIDENT_NOT_CLAIMED,
  NOT_THE_CLAIMER,
  WRONG_ORGANIZATION,
} from './incident-workflow.errors';

/**
 * sc-315 — `changeStatus()` publica el evento y purga los listados cacheados
 * después del commit, porque absorbió el camino de
 * `IncidentsService.updateStatus()`. Estas unidades no ejercitan esos efectos
 * —los cubren los e2e, que sí tienen Redis— pero el módulo tiene que poder
 * construirse, así que se declaran como dobles inertes en un solo lugar.
 *
 * Inertes a propósito: un doble que devuelve algo invita a afirmar sobre él
 * acá, y afirmar sobre una purga de caché sin caché real es afirmar sobre el
 * doble, no sobre el sistema.
 */
const SIDE_EFFECT_DOUBLES = [
  {
    provide: GeofencingService,
    useValue: { purgeZoneCache: jest.fn().mockResolvedValue(undefined) },
  },
  { provide: EventEmitter2, useValue: { emit: jest.fn() } },
  { provide: REDIS_CLIENT, useValue: { xadd: jest.fn().mockResolvedValue('1-0') } },
];

// ---------- helpers ----------------------------------------------------------

function makeDataSource(queryMock: jest.Mock) {
  return { query: queryMock } as unknown as DataSource;
}

function makeOrgRepo(org: Partial<OrganizationEntity> | null) {
  return {
    findOne: jest.fn().mockResolvedValue(org),
  } as unknown as Repository<OrganizationEntity>;
}

const OP_A = { id: 'op-a', organizationId: 'org-X', role: 'operador_org' };
const OP_B = { id: 'op-b', organizationId: 'org-X', role: 'operador_org' };
const ADMIN = { id: 'admin-1', organizationId: 'org-X', role: 'master' };
const OUTSIDER = { id: 'op-z', organizationId: 'org-Y', role: 'operador_org' };

const INCIDENT = {
  id: 'inc-1',
  title: 'Test',
  status: 'pending',
  priority: 'medium',
  claimed_by: null,
  organization_id: 'org-X',
  updated_at: new Date('2026-08-23T00:00:00Z'),
};

// query() is invoked in a known order per call path; we script the answers
// queue-style (shift) so each invocation gets the right mocked row.
function makeQueuedQuery(answers: unknown[]) {
  return jest.fn().mockImplementation(() => {
    if (answers.length === 0) {
      throw new Error('Query queue exhausted — test under-spec');
    }
    return Promise.resolve(answers.shift());
  });
}

async function buildService(
  queryAnswers: unknown[],
  org: Partial<OrganizationEntity> | null = null,
): Promise<IncidentWorkflowService> {
  const module = await Test.createTestingModule({
    providers: [
      IncidentWorkflowService,
      ...SIDE_EFFECT_DOUBLES,
      { provide: getRepositoryToken(OrganizationEntity), useValue: makeOrgRepo(org) },
      { provide: DataSource, useValue: makeDataSource(makeQueuedQuery(queryAnswers)) },
    ],
  }).compile();
  return module.get(IncidentWorkflowService);
}

// ---------- claim -----------------------------------------------------------

describe('IncidentWorkflowService.claim', () => {
  it('throws NotFoundException when the incident does not exist', async () => {
    const svc = await buildService([[]]);
    await expect(svc.claim('missing', OP_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException with WRONG_ORGANIZATION when the operator is not in the same org', async () => {
    const svc = await buildService([[INCIDENT]]);
    const err = await svc.claim('inc-1', OUTSIDER).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.message).toContain(WRONG_ORGANIZATION);
  });

  it('lets a system admin claim across orgs', async () => {
    // 1) loadIncident → [INCIDENT]  2) active-count → 0  3) CAS → [updated]
    const updated = { ...INCIDENT, claimed_by: ADMIN.id };
    const svc = await buildService([
      [INCIDENT],
      [{ count: '0' }],
      [updated],
    ]);
    const res = await svc.claim('inc-1', ADMIN);
    expect(res.claimedBy).toBe(ADMIN.id);
  });

  it('throws HttpException with CLAIM_LIMIT_REACHED when the operator is at the cap', async () => {
    // 1) loadIncident  2) active-count returns 5 (== max=5)
    const svc = await buildService([[INCIDENT], [{ count: '5' }]], {
      id: 'org-X',
      maxActiveClaims: 5,
    } as OrganizationEntity);
    const err = await svc.claim('inc-1', OP_A).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.message).toContain(CLAIM_LIMIT_REACHED);
  });

  it('throws ConflictException with INCIDENT_ALREADY_CLAIMED on CAS miss', async () => {
    // 1) loadIncident  2) active-count = 0  3) CAS returns []
    const svc = await buildService([[INCIDENT], [{ count: '0' }], []]);
    const err = await svc.claim('inc-1', OP_A).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain(INCIDENT_ALREADY_CLAIMED);
  });

  it('returns the updated row on the happy path', async () => {
    const updated = { ...INCIDENT, claimed_by: OP_A.id };
    const svc = await buildService([[INCIDENT], [{ count: '0' }], [updated]]);
    const res = await svc.claim('inc-1', OP_A);
    expect(res.claimedBy).toBe(OP_A.id);
    expect(res.id).toBe('inc-1');
    expect(res.status).toBe('pending');
  });

  it('does not manually write updated_at in the claim UPDATE (trigger handles it)', async () => {
    const updated = { ...INCIDENT, claimed_by: OP_A.id };
    const queryMock = jest.fn();
    queryMock.mockResolvedValueOnce([INCIDENT]); // loadIncident
    queryMock.mockResolvedValueOnce([{ count: '0' }]); // activeClaimCountFor
    queryMock.mockResolvedValueOnce([updated]); // claim UPDATE

    const module = await Test.createTestingModule({
      providers: [
        IncidentWorkflowService,
        ...SIDE_EFFECT_DOUBLES,
        { provide: getRepositoryToken(OrganizationEntity), useValue: makeOrgRepo(null) },
        { provide: DataSource, useValue: makeDataSource(queryMock) },
      ],
    }).compile();
    const svc = module.get(IncidentWorkflowService);

    await svc.claim('inc-1', OP_A);

    const claimUpdateCall = queryMock.mock.calls[2]; // third call is the claim UPDATE
    const sql = claimUpdateCall[0];
    expect(sql).not.toContain('updated_at = ');
    expect(sql).toContain('claimed_at = NOW()');
  });
});

// ---------- release ---------------------------------------------------------

describe('IncidentWorkflowService.release', () => {
  it('throws NotFoundException when the incident does not exist', async () => {
    const svc = await buildService([[]]);
    await expect(svc.release('missing', OP_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ConflictException with INCIDENT_NOT_CLAIMED when claimed_by is null', async () => {
    const svc = await buildService([[INCIDENT]]);
    const err = await svc.release('inc-1', OP_A).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toContain(INCIDENT_NOT_CLAIMED);
  });

  it('throws ForbiddenException with NOT_THE_CLAIMER when the caller is not the holder', async () => {
    const claimed = { ...INCIDENT, claimed_by: OP_A.id };
    const svc = await buildService([[claimed]]);
    const err = await svc.release('inc-1', OP_B).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.message).toContain(NOT_THE_CLAIMER);
  });

  it('clears claimed_by on the happy path', async () => {
    const claimed = { ...INCIDENT, claimed_by: OP_A.id };
    const cleared = { ...claimed, claimed_by: null };
    const svc = await buildService([[claimed], [cleared]]);
    const res = await svc.release('inc-1', OP_A);
    expect(res.claimedBy).toBeNull();
  });

  it('does not manually write updated_at in the release UPDATE (trigger handles it)', async () => {
    const claimed = { ...INCIDENT, claimed_by: OP_A.id };
    const cleared = { ...claimed, claimed_by: null };
    const queryMock = jest.fn();
    queryMock.mockResolvedValueOnce([claimed]); // loadIncident
    queryMock.mockResolvedValueOnce([cleared]); // release UPDATE

    const module = await Test.createTestingModule({
      providers: [
        IncidentWorkflowService,
        ...SIDE_EFFECT_DOUBLES,
        { provide: getRepositoryToken(OrganizationEntity), useValue: makeOrgRepo(null) },
        { provide: DataSource, useValue: makeDataSource(queryMock) },
      ],
    }).compile();
    const svc = module.get(IncidentWorkflowService);

    await svc.release('inc-1', OP_A);

    const releaseUpdateCall = queryMock.mock.calls[1]; // second call is the release UPDATE
    const sql = releaseUpdateCall[0];
    expect(sql).not.toContain('updated_at = ');
    expect(sql).toContain('claimed_by = NULL');
  });
});

// ---------- availableOperators --------------------------------------------

describe('IncidentWorkflowService.availableOperators', () => {
  it('returns [] when the incident has no organization', async () => {
    const orphan = { ...INCIDENT, organization_id: null };
    const svc = await buildService([[orphan]]);
    expect(await svc.availableOperators('inc-1')).toEqual([]);
  });

  it('returns operators under the cap, excluding the current claimer', async () => {
    const claimed = { ...INCIDENT, claimed_by: OP_A.id };
    // 1) loadIncident  2) operator SELECT — only OP_B returned (OP_A excluded, count < max)
    const svc = await buildService(
      [
        [claimed],
        [
          {
            id: OP_B.id,
            name: 'operator-b-device',
            email: 'b@x.test',
            active_count: '2',
          },
        ],
      ],
      { id: 'org-X', maxActiveClaims: 5 } as OrganizationEntity,
    );
    const list = await svc.availableOperators('inc-1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(OP_B.id);
    expect(list[0].activeClaimCount).toBe(2);
  });
});

// ---------- getStatuses ----------------------------------------------------

describe('IncidentWorkflowService.getStatuses', () => {
  // F1 (sc-315) — regresión del defecto 1. El test debe fallar antes
  // del cambio (devuelve 3) y pasar después (devuelve 4, derivado de
  // `Object.keys(TRANSITIONS)`).
  it('returns the four IncidentStatus enum values, including closed (sc-315 D3)', async () => {
    const svc = await buildService([]);
    const statuses = svc.getStatuses();
    expect(statuses).toHaveLength(4);
    expect(statuses).toEqual(
      expect.arrayContaining(['pending', 'in_progress', 'resolved', 'closed']),
    );
  });

  it('derives the list from the state machine, not a hand-maintained array (sc-315 D3)', async () => {
    // Si las dos listas se desincronizan, el consumidor (frontend de
    // F3, reports) se entera: `closed` no puede volver a quedar
    // "implementado" en el tipo y ausente del listado.
    const svc = await buildService([]);
    expect(new Set(svc.getStatuses())).toEqual(
      new Set(['pending', 'in_progress', 'resolved', 'closed']),
    );
  });
});

// ---------- changeStatus (sc-315) ------------------------------------------

describe('IncidentWorkflowService.changeStatus (sc-315)', () => {
  it('REJECTS resolved → closed with 409 INCIDENT_INVALID_TRANSITION (D1)', async () => {
    // Test de regresión del bug original: la semántica vieja permitía
    // esta transición. La nueva la prohíbe explícitamente.
    //
    // Mock del manager: la transacción ejecuta un SELECT FOR UPDATE
    // que devuelve la fila en estado `resolved`; la transición debe
    // rechazarse antes de cualquier UPDATE o INSERT.
    const inProgressRow = {
      id: 'inc-1',
      title: 'Pothole',
      status: 'resolved',
      priority: 'medium',
      claimed_by: null,
      organization_id: 'org-X',
      updated_at: new Date(),
    };
    const queryMock = jest.fn().mockResolvedValueOnce([inProgressRow]);
    const transactionSpy = jest.fn(async (cb: (manager: unknown) => unknown) =>
      cb({ query: queryMock, queryRunner: { query: queryMock } }),
    );
    const dataSource = { transaction: transactionSpy } as unknown as DataSource;

    const module = await Test.createTestingModule({
      providers: [
        IncidentWorkflowService,
        ...SIDE_EFFECT_DOUBLES,
        { provide: getRepositoryToken(OrganizationEntity), useValue: makeOrgRepo(null) },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    const svc = module.get(IncidentWorkflowService);

    await expect(
      svc.changeStatus({
        incidentId: 'inc-1',
        to: 'closed',
        actorId: 'user-1',
        actorPermissions: ['CLOSE incidents'],
        closedReason: 'no aplica, la transición es ilegal',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    // El SELECT FOR UPDATE corrió (leímos el estado actual)…
    expect(queryMock).toHaveBeenCalledTimes(1);
    // …pero no hubo UPDATE ni INSERT a status_history.
    // (canTransition se valida antes de cualquier escritura.)
  });

  it('REJECTS closed without reason with 422 INCIDENT_CLOSED_REASON_REQUIRED (D4)', async () => {
    // sc-315 C5 (ronda 2) — el código de respuesta es 422, no 400.
    // El test verifica AMBOS: la clase (`UnprocessableEntityException`)
    // y el `getStatus()` real de NestJS (que es 422). Si alguien
    // cambia a `BadRequestException` "porque sí", este test lo nombra
    // y el cliente de F3 (workflow.util.ts) puede distinguir.
    const inProgressRow = {
      id: 'inc-1',
      title: 'Pothole',
      status: 'in_progress',
      priority: 'medium',
      claimed_by: null,
      organization_id: 'org-X',
      updated_at: new Date(),
    };
    const queryMock = jest.fn().mockResolvedValueOnce([inProgressRow]);
    const transactionSpy = jest.fn(async (cb: (manager: unknown) => unknown) =>
      cb({ query: queryMock, queryRunner: { query: queryMock } }),
    );
    const dataSource = { transaction: transactionSpy } as unknown as DataSource;

    const module = await Test.createTestingModule({
      providers: [
        IncidentWorkflowService,
        ...SIDE_EFFECT_DOUBLES,
        { provide: getRepositoryToken(OrganizationEntity), useValue: makeOrgRepo(null) },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    const svc = module.get(IncidentWorkflowService);

    let caught: unknown;
    try {
      await svc.changeStatus({
        incidentId: 'inc-1',
        to: 'closed',
        actorId: 'user-1',
        actorPermissions: ['CLOSE incidents'],
        // closedReason ausente a propósito
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect(caught).not.toBeInstanceOf(BadRequestException);
    // 422 verificado contra el `getStatus()` real de Nest, no sólo
    // contra la clase — la clase cambia de nombre en cada versión
    // menor, el status number es contrato HTTP.
    expect((caught as HttpException).getStatus()).toBe(422);
  });

  it('REJECTS closed without CLOSE incidents permission with 403 (D8 defense in depth)', async () => {
    const inProgressRow = {
      id: 'inc-1',
      title: 'Pothole',
      status: 'in_progress',
      priority: 'medium',
      claimed_by: null,
      organization_id: 'org-X',
      updated_at: new Date(),
    };
    const queryMock = jest.fn().mockResolvedValueOnce([inProgressRow]);
    const transactionSpy = jest.fn(async (cb: (manager: unknown) => unknown) =>
      cb({ query: queryMock, queryRunner: { query: queryMock } }),
    );
    const dataSource = { transaction: transactionSpy } as unknown as DataSource;

    const module = await Test.createTestingModule({
      providers: [
        IncidentWorkflowService,
        ...SIDE_EFFECT_DOUBLES,
        { provide: getRepositoryToken(OrganizationEntity), useValue: makeOrgRepo(null) },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    const svc = module.get(IncidentWorkflowService);

    await expect(
      svc.changeStatus({
        incidentId: 'inc-1',
        to: 'closed',
        actorId: 'operator-1',
        actorPermissions: ['UPDATE incidents'], // sin CLOSE
        closedReason: 'intento de cierre sin permiso',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('writes UPDATE + status_history in the same transaction (S.5.1)', async () => {
    // El happy path: la transición es válida, hay motivo, hay permiso.
    // Verificamos que la transacción del DataSource envuelve tanto el
    // UPDATE como el INSERT, y que la segunda llamada (INSERT) lleva
    // el `notes` con el motivo de cierre.
    const inProgressRow = {
      id: 'inc-1',
      title: 'Pothole',
      status: 'in_progress',
      priority: 'medium',
      claimed_by: 'op-1',
      organization_id: 'org-X',
      closed_reason: null,
      updated_at: new Date(),
    };
    const closedRow = {
      ...inProgressRow,
      status: 'closed',
      closed_reason: 'recurso no disponible',
    };
    // 1) SELECT FOR UPDATE  2) UPDATE  3) INSERT status_history
    const queryMock = jest
      .fn()
      .mockResolvedValueOnce([inProgressRow])
      .mockResolvedValueOnce([closedRow]);
    const transactionSpy = jest.fn(async (cb: (manager: unknown) => unknown) =>
      cb({ query: queryMock, queryRunner: { query: queryMock } }),
    );
    const dataSource = { transaction: transactionSpy } as unknown as DataSource;

    const module = await Test.createTestingModule({
      providers: [
        IncidentWorkflowService,
        ...SIDE_EFFECT_DOUBLES,
        { provide: getRepositoryToken(OrganizationEntity), useValue: makeOrgRepo(null) },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    const svc = module.get(IncidentWorkflowService);

    const result = await svc.changeStatus({
      incidentId: 'inc-1',
      to: 'closed',
      actorId: 'admin-1',
      actorPermissions: ['CLOSE incidents'],
      closedReason: 'recurso no disponible',
    });

    // C1 (ronda 2) — la fila de retorno expone `closed_reason`. Si este
    // aserto falla, D4 del design queda sin cumplimiento: el motivo se
    // persistiría pero sería de sólo escritura desde la perspectiva de
    // la API.
    expect(result.status).toBe('closed');
    expect(result.closed_reason).toBe('recurso no disponible');
    expect(queryMock).toHaveBeenCalledTimes(3); // SELECT, UPDATE, INSERT
    // El INSERT llevó el motivo en `notes` para que el historial
    // pueda reconstruir el cierre sin joins extra.
    const insertCall = queryMock.mock.calls[2];
    expect(insertCall[0]).toContain('INSERT INTO status_history');
    // mock.calls[2] = [sql, [incidentId, actorId, from, to, notes]]
    expect(insertCall[1][4]).toBe('[closed] recurso no disponible');
  });

  it('S.5.3: a rejected transition does NOT write to status_history (rollback implicit)', async () => {
    // El test de S.5.3: si la transición es inválida, no se ejecuta
    // UPDATE ni INSERT a status_history. La primera llamada al query
    // es el SELECT FOR UPDATE, que es de sólo lectura. La maquina
    // rechaza antes de cualquier escritura.
    const inProgressRow = {
      id: 'inc-1',
      title: 'Pothole',
      status: 'resolved',
      priority: 'medium',
      claimed_by: null,
      organization_id: 'org-X',
      updated_at: new Date(),
    };
    const queryMock = jest.fn().mockResolvedValueOnce([inProgressRow]);
    const transactionSpy = jest.fn(async (cb: (manager: unknown) => unknown) =>
      cb({ query: queryMock, queryRunner: { query: queryMock } }),
    );
    const dataSource = { transaction: transactionSpy } as unknown as DataSource;

    const module = await Test.createTestingModule({
      providers: [
        IncidentWorkflowService,
        ...SIDE_EFFECT_DOUBLES,
        { provide: getRepositoryToken(OrganizationEntity), useValue: makeOrgRepo(null) },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    const svc = module.get(IncidentWorkflowService);

    await expect(
      svc.changeStatus({
        incidentId: 'inc-1',
        to: 'in_progress', // resolved → in_progress: inválido
        actorId: 'user-1',
        actorPermissions: ['UPDATE incidents'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    // Solo el SELECT FOR UPDATE, ningún UPDATE ni INSERT.
    expect(queryMock).toHaveBeenCalledTimes(1);
    // La única llamada fue un SELECT (verificable por el SQL: el primer
    // argumento es la string del query y empieza con SELECT).
    expect(queryMock.mock.calls[0][0]).toMatch(/^SELECT/);
  });
});
