import { randomUUID } from 'crypto';
import request from 'supertest';

import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * 2026-10-21 — E2E del cap de asignaciones (`assertClaimCapAllowed`).
 *
 * ## Por qué este spec
 *
 * `AssignmentsService.assertClaimCapAllowed` es un `if` de cuatro salidas
 * que ninguna prueba de punta a punta alcanzaba. `dispatch-workflow.e2e`
 * creaba la org con `max_active_claims = 5` y un solo operador, así que la
 * rama "en cap" nunca se ejecutaba. Con una prueba unitaria por rama
 * (`assignments.service.spec.ts`) el riesgo es que las tres condiciones del
 * override dejen de funcionar JUNTAS: cada una por separado pasa, y el día
 * que el cap se llega de verdad en producción nadie lo ha visto.
 *
 * ## Lo que cuenta
 *
 * `getActiveClaimCount` cuenta `incidents WHERE claimed_by = op AND status
 * = 'in_progress'` — NO filas de `assignments`. Un operador con cinco
 * asignaciones `pending` tiene cero claims activos. Los fixtures de abajo
 * lo hacen a propósito: asignar y nada más NO satura a nadie.
 *
 * ## Aislamiento entre tests
 *
 * El cap se mide por OPERADOR, no por organización. Cada test crea su
 * propia org, su operador y sus incidencias, así que ninguno puede
 * contaminar al siguiente.
 */

const SANTA_ELENA_ZONE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';
const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

describe('E2E cap de asignaciones — admin_org ↔ operator_org', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env?.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  /**
   * Org con el cap que pida el test. `incident_category_id = NULL` la hace
   * transversal: matchea cualquier categoría, así el geofence resuelve sin
   * depender del catálogo sembrado.
   */
  async function seedOrg(maxActiveClaims: number): Promise<string> {
    await env.pg.query(`DELETE FROM organizations WHERE zone_id = $1`, [
      SANTA_ELENA_ZONE_ID,
    ]);
    const orgId = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id, max_active_claims, incident_category_id)
       VALUES ($1, $2, $3, $4, NULL)`,
      [orgId, `Cap E2E Org ${orgId.slice(0, 8)}`, SANTA_ELENA_ZONE_ID, maxActiveClaims],
    );
    return orgId;
  }

  async function seedIncident(
    orgId: string,
    reporter: ProvisionedUser,
    title: string,
    priority: 'low' | 'medium' | 'high' | 'critical',
  ): Promise<string> {
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ title, description: 'incidencia de prueba de cap', priority, ...INSIDE_SANTA_ELENA })
      .expect(201);
    expect(created.body.organization_id).toBe(orgId);
    return created.body.id as string;
  }

  /** Mete al operador en `in_progress` N veces — eso es lo que cuenta como claim. */
  async function saturate(
    operatorId: string,
    reporter: ProvisionedUser,
    orgId: string,
    n: number,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium',
  ): Promise<void> {
    for (let i = 0; i < n; i += 1) {
      const id = await seedIncident(orgId, reporter, `Carga ${i} ${priority}`, priority);
      await env.pg.query(
        `UPDATE incidents SET claimed_by = $1, status = 'in_progress' WHERE id = $2`,
        [operatorId, id],
      );
    }
  }

  it('cap alcanzado sin override → 429 CLAIM_LIMIT_REACHED', async () => {
    const orgId = await seedOrg(2);
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `cap-no-override-reporter-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'reporter',
    });
    const adminOrg = await env.provisionUser(['READ incidents', 'ASSIGN assignments'], {
      email: `cap-no-override-admin-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const operator = await env.provisionUser(['READ incidents', 'UPDATE incidents'], {
      email: `cap-no-override-op-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'operator_org',
    });

    await saturate(operator.userId, reporter, orgId, 2);

    const incidentId = await seedIncident(orgId, reporter, 'Tercera assignment', 'medium');

    const res = await request(env.httpServer)
      .post('/api/assignments')
      .set({ Authorization: `Bearer ${adminOrg.accessToken}` })
      .send({ incident_id: incidentId, operator_id: operator.userId })
      .expect(429);

    expect(res.body).toBe('CLAIM_LIMIT_REACHED');
    // La forma del body es asimétrica con la rama 422: acá Nest devuelve
    // el string pelado (`HttpException('FOO', 429)` → `body = 'FOO'`),
    // mientras las 422 van con `{code, message}` (`UnprocessableEntityException`).
    // Unificar la shape del 429 sería romper el contrato con el frontend
    // — fuera del scope de "cubrir con e2e". Mejor documentado que
    // "arreglado a medias".
    // Lo que importa además del status es que la fila NO se haya creado:
    // un 429 "honesto" aborta antes del INSERT.
    const rows = await env.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM assignments WHERE incident_id = $1`,
      [incidentId],
    );
    expect(rows.rows[0].n).toBe(0);
  });

  it('override_cap con las TRES condiciones (critical + razón + admin_org) → 201', async () => {
    const orgId = await seedOrg(1);
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `cap-ok-reporter-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'reporter',
    });
    const adminOrg = await env.provisionUser(['READ incidents', 'ASSIGN assignments'], {
      email: `cap-ok-admin-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const operator = await env.provisionUser(['READ incidents', 'UPDATE incidents'], {
      email: `cap-ok-op-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'operator_org',
    });

    await saturate(operator.userId, reporter, orgId, 1);

    const incidentId = await seedIncident(orgId, reporter, 'Crítica con override', 'critical');

    await request(env.httpServer)
      .post('/api/assignments')
      .set({ Authorization: `Bearer ${adminOrg.accessToken}` })
      .send({
        incident_id: incidentId,
        operator_id: operator.userId,
        override_cap: true,
        override_reason: 'Emergencia vital: operador único en turno',
      })
      .expect(201);
  });

  it('override_cap=true pero la incidencia NO es critical → 422 CAP_OVERRIDE_NOT_ALLOWED_FOR_PRIORITY', async () => {
    const orgId = await seedOrg(1);
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `cap-prio-reporter-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'reporter',
    });
    const adminOrg = await env.provisionUser(['READ incidents', 'ASSIGN assignments'], {
      email: `cap-prio-admin-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const operator = await env.provisionUser(['READ incidents', 'UPDATE incidents'], {
      email: `cap-prio-op-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'operator_org',
    });

    await saturate(operator.userId, reporter, orgId, 1);
    const incidentId = await seedIncident(orgId, reporter, 'No crítica', 'high');

    const res = await request(env.httpServer)
      .post('/api/assignments')
      .set({ Authorization: `Bearer ${adminOrg.accessToken}` })
      .send({ incident_id: incidentId, operator_id: operator.userId, override_cap: true, override_reason: 'porque sí' })
      .expect(422);

    expect(res.body.code ?? res.body.message).toBe('CAP_OVERRIDE_NOT_ALLOWED_FOR_PRIORITY');
  });

  it('override_cap=true en critical pero SIN razón → 422 CAP_OVERRIDE_REASON_REQUIRED', async () => {
    const orgId = await seedOrg(1);
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `cap-reason-reporter-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'reporter',
    });
    const adminOrg = await env.provisionUser(['READ incidents', 'ASSIGN assignments'], {
      email: `cap-reason-admin-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const operator = await env.provisionUser(['READ incidents', 'UPDATE incidents'], {
      email: `cap-reason-op-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'operator_org',
    });

    await saturate(operator.userId, reporter, orgId, 1);
    const incidentId = await seedIncident(orgId, reporter, 'Crítica sin razón', 'critical');

    const res = await request(env.httpServer)
      .post('/api/assignments')
      .set({ Authorization: `Bearer ${adminOrg.accessToken}` })
      .send({ incident_id: incidentId, operator_id: operator.userId, override_cap: true })
      .expect(422);

    expect(res.body.code ?? res.body.message).toBe('CAP_OVERRIDE_REASON_REQUIRED');
  });
});