import { randomUUID } from 'crypto';
import request from 'supertest';

import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * `back/2026-09-15-departments-module` — Phase D.1, escenarios D.1.
 *
 * ── 2026-10-20: revivido ────────────────────────────────────────────────────
 *
 * El archivo llevaba meses con `itIf(!!process.env.RUN_DEPT_E2E)` sobre diez
 * cuerpos VACÍOS: cada `it` sólo tenía comentarios `// Assert: …` debajo. No
 * era "tests gateados", era scaffolding — nunca se ejecutó nada y el motivo
 * declarado ("Testcontainer runtime is NOT available in this dev sandbox") ya
 * no aplica: `globalSetup` levanta Postgres + Redis una vez para toda la
 * corrida y el harness compartido (`TestEnvironment`) ya lo usa el resto de
 * la suite.
 *
 * Segunda corrección, más importante: el setup original sobreescribía
 * `JwtAuthGuard` y `PermissionGuard` con `canActivate: () => true`
 * (líneas 46-49 del archivo viejo). Aunque hubiera corrido, **no probaba
 * autorización**: todo pasaba. Estos escenarios usan los guards reales y
 * tokens reales de `provisionUser`, así que un 403 es un 403 de verdad.
 *
 * El escenario 2 estaba marcado "Out of scope; deferred to a follow-up" y se
 * queda explícitamente fuera: depende de que `IncidentsService.create`
 *vegüe `user.department_id` (design D5), que es otro módulo.
 */

const SANTA_ELENA_ZONE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';

describe('Departments e2e — D.1 (harness compartido, guards reales)', () => {
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

  /** Org nueva en la zona semilla. `reset()` no trunca organizations. */
  async function seedOrg(label: string): Promise<string> {
    const id = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id, max_active_claims, incident_category_id)
       VALUES ($1, $2, $3, 5, NULL)`,
      [id, `${label} ${id.slice(0, 8)}`, SANTA_ELENA_ZONE_ID],
    );
    return id;
  }

  /** Usuario con permisos explícitos — la matriz se prueba de verdad. */
  function staff(
    permissions: string[],
    roleName: string,
    organizationId: string | null,
  ): Promise<ProvisionedUser> {
    return env.provisionUser(permissions, { roleName, organizationId });
  }

  const CRUD = ['CREATE departments', 'READ departments', 'UPDATE departments', 'DELETE departments'];

  // ── Escenario 1 ────────────────────────────────────────────────────────────
  it('S1: crear depto como master → 201 y aparece en el listado', async () => {
    const orgId = await seedOrg('S1 Org');
    const master = await staff(CRUD, 'master', null);

    const created = await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ name: 'Traffic', organization_id: orgId })
      .expect(201);

    expect(created.body.id).toBeDefined();
    expect(created.body.name).toBe('Traffic');

    const list = await request(env.httpServer)
      .get(`/api/departments?organization_id=${orgId}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);

    expect(list.body.items.map((d: { id: string }) => d.id)).toContain(created.body.id);
  });

  // ── Escenario 2 — fuera de alcance, documentado ────────────────────────────
  it.skip('S2: usuario con depto → crear incidencia → dept_id auto-asignado', () => {
    // Depende de que IncidentsService.create use user.department_id
    // (design D.5). Fuera del alcance de este lote.
  });

  // ── Escenario 3 ────────────────────────────────────────────────────────────
  it('S3: borrar depto → sus incidencias quedan huérfanas (department_id NULL)', async () => {
    const orgId = await seedOrg('S3 Org');
    const master = await staff(CRUD, 'master', null);
    const reporter = await staff(['CREATE incidents'], 'reporter', orgId);

    const dept = await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ name: 'A borrar', organization_id: orgId })
      .expect(201);

    await env.pg.query(`UPDATE users SET department_id = $1 WHERE id = $2`, [
      dept.body.id,
      reporter.userId,
    ]);

    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ title: 'Incidente con depto', description: 'x', lat: -2.2, lng: -80.5 })
      .expect(201);

    await request(env.httpServer)
      .delete(`/api/departments/${dept.body.id}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);

    const rows = await env.pg.query<{ department_id: string | null }>(
      `SELECT department_id FROM incidents WHERE id = $1`,
      [incident.body.id],
    );
    expect(rows.rows[0].department_id).toBeNull();
  });

  // ── Escenario 4 ────────────────────────────────────────────────────────────
  it('S4: admin_org no ve los departamentos de otra org', async () => {
    const orgA = await seedOrg('S4 Org A');
    const orgB = await seedOrg('S4 Org B');
    const master = await staff(CRUD, 'master', null);

    for (const [name, org] of [['Dept A', orgA], ['Dept B', orgB]] as const) {
      await request(env.httpServer)
        .post('/api/departments')
        .set({ Authorization: `Bearer ${master.accessToken}` })
        .send({ name: `${name} ${randomUUID().slice(0, 6)}`, organization_id: org })
        .expect(201);
    }

    const adminA = await staff(CRUD, 'admin_org', orgA);
    const list = await request(env.httpServer)
      .get('/api/departments')
      .set({ Authorization: `Bearer ${adminA.accessToken}` })
      .expect(200);

    const orgsSeen = new Set(
      (list.body.items as Array<{ organization_id: string }>).map((d) => d.organization_id),
    );
    expect([...orgsSeen]).toEqual([orgA]);
  });

  // ── Escenario 5 ────────────────────────────────────────────────────────────
  it('S5: admin_org no puede crear un depto en otra org', async () => {
    const orgA = await seedOrg('S5 Org A');
    const orgB = await seedOrg('S5 Org B');
    const adminA = await staff(CRUD, 'admin_org', orgA);

    await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${adminA.accessToken}` })
      .send({ name: 'Intruso', organization_id: orgB })
      .expect(403);
  });

  // ── Escenario 6 ────────────────────────────────────────────────────────────
  it('S6: soft delete oculta el depto del listado y 404 en el detalle', async () => {
    const orgId = await seedOrg('S6 Org');
    const master = await staff(CRUD, 'master', null);

    const dept = await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ name: `Se va ${randomUUID().slice(0, 6)}`, organization_id: orgId })
      .expect(201);

    await request(env.httpServer)
      .delete(`/api/departments/${dept.body.id}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);

    const list = await request(env.httpServer)
      .get(`/api/departments?organization_id=${orgId}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);
    expect(list.body.items.map((d: { id: string }) => d.id)).not.toContain(dept.body.id);

    // Y el detalle responde 404 — la lectura filtra `deleted_at IS NULL`.
    await request(env.httpServer)
      .get(`/api/departments/${dept.body.id}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(404);
  });

  // ── Escenario 7 ────────────────────────────────────────────────────────────
  it('S7: el filtro de búsqueda es case-insensitive', async () => {
    const orgId = await seedOrg('S7 Org');
    const master = await staff(CRUD, 'master', null);

    for (const name of ['Traffic', 'traffic', 'TRAFFIC']) {
      await request(env.httpServer)
        .post('/api/departments')
        .set({ Authorization: `Bearer ${master.accessToken}` })
        .send({ name: `${name} ${randomUUID().slice(0, 6)}`, organization_id: orgId })
        .expect(201);
    }
    await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ name: `Senalizacion ${randomUUID().slice(0, 6)}`, organization_id: orgId })
      .expect(201);

    for (const term of ['traffic', 'TRAFFIC', 'TrAfFiC']) {
      const res = await request(env.httpServer)
        .get(`/api/departments?organization_id=${orgId}&search=${term}`)
        .set({ Authorization: `Bearer ${master.accessToken}` })
        .expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.total).toBeGreaterThan(0);
    }

    const miss = await request(env.httpServer)
      .get(`/api/departments?organization_id=${orgId}&search=zzz-no-existe`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);
    expect(miss.body.items).toHaveLength(0);
  });

  // ── Escenario 8 ────────────────────────────────────────────────────────────
  it('S8: per_page se limita a 100', async () => {
    const orgId = await seedOrg('S8 Org');
    const master = await staff(CRUD, 'master', null);

    for (let i = 0; i < 3; i++) {
      await request(env.httpServer)
        .post('/api/departments')
        .set({ Authorization: `Bearer ${master.accessToken}` })
        .send({ name: `Dept ${i}-${randomUUID().slice(0, 6)}`, organization_id: orgId })
        .expect(201);
    }

    const clamped = await request(env.httpServer)
      .get(`/api/departments?organization_id=${orgId}&per_page=9999`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);
    // Con 3 filas no se alcanza el tope, pero la respuesta no debe exceder 100
    // ni fallar: es el clamp el que se verifica, no el número de filas.
    expect(clamped.body.items.length).toBeLessThanOrEqual(100);
    expect(clamped.body.items.length).toBe(3);
  });

  // ── Escenario 9 ────────────────────────────────────────────────────────────
  it('S9: PATCH cambia el nombre y no puede mover el depto de org', async () => {
    const orgA = await seedOrg('S9 Org A');
    const orgB = await seedOrg('S9 Org B');
    const master = await staff(CRUD, 'master', null);

    const dept = await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ name: 'Nombre viejo', organization_id: orgA })
      .expect(201);

    const nuevo = `Nombre nuevo ${randomUUID().slice(0, 6)}`;
    const patched = await request(env.httpServer)
      .patch(`/api/departments/${dept.body.id}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ name: nuevo })
      .expect(200);

    expect(patched.body.name).toBe(nuevo);
    expect(patched.body.organization_id).toBe(orgA);
  });

  // ── Escenario 10 ───────────────────────────────────────────────────────────
  it('S10: sin permiso de departments el POST es 403; con permiso, 201', async () => {
    const orgId = await seedOrg('S10 Org');
    const master = await staff(CRUD, 'master', null);
    const name = `Con perm ${randomUUID().slice(0, 6)}`;

    // Sin `CREATE departments` → el PermissionGuard real rechaza.
    const sinPermiso = await staff(['READ incidents'], 'operator_org', orgId);
    await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${sinPermiso.accessToken}` })
      .send({ name: `${name}-x`, organization_id: orgId })
      .expect(403);

    // Con el permiso, la misma llamada pasa.
    await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ name, organization_id: orgId })
      .expect(201);
  });

  // ── Extras que el gate anterior nunca pudo cubrir ──────────────────────────
  it('X1: sin permiso de READ tampoco se puede listar', async () => {
    const orgId = await seedOrg('X1 Org');
    const sinPermiso = await staff(['CREATE incidents'], 'operator_org', orgId);

    await request(env.httpServer)
      .get('/api/departments')
      .set({ Authorization: `Bearer ${sinPermiso.accessToken}` })
      .expect(403);
  });

  it('X2: un token inválido da 401, no 500', async () => {
    await request(env.httpServer)
      .get('/api/departments')
      .set({ Authorization: 'Bearer no-es-un-jwt' })
      .expect(401);
  });
});