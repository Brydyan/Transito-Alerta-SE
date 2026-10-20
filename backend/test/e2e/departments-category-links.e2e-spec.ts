import { randomUUID } from 'crypto';
import * as request from 'supertest';

import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * 2026-10-20 — contrato del M:N `department_incident_categories`.
 *
 * `DepartmentsService.updateWithCategories` (departments.service.ts:132-142)
 * distingue DOS cosas que en el wire se ven casi iguales:
 *
 *   category_ids OMITIDO  → `null` → no toca la asignación
 *   category_ids: []      → `[]`   → la borra
 *
 * Es la distinción que decide si un departamento sigue siendo visible para
 * `available-operators` o desaparece del dropdown de despacho. El filtro
 * `department_id IN (SELECT department_id FROM category_depts)`
 * (incident-workflow.service.ts:295-326) no tiene fallback para un
 * departamento que perdió sus vínculos: los operadores de ese depto dejan de
 * aparecer, sin error en ninguna capa.
 *
 * Este spec NO prueba un bug: el servicio está bien. Pina un contrato que
 * ningún test cubría y que un refactor podría romper en una línea —
 * `replaceCategoriesForDept(id, categoryIds ?? [])` en vez de distinguir
 * `null`. Ese es exactamente el modo de falla que produjo el incidente del
 * `/auth/me` 500: una suposición documentada que nadie verificó.
 *
 * No depende de `RUN_DEPT_E2E`, que deja skippeados los 10 escenarios del
 * módulo departments (departments.e2e-spec.ts:65-67).
 */

const SANTA_ELENA_ZONE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';
const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

describe('E2E departments — contrato del M:N con incident_categories', () => {
  let env: TestEnvironment;
  let master: ProvisionedUser;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env?.stop();
  }, 60_000);

  let orgId: string;
  let categoryA: string;
  let categoryB: string;
  let deptId: string;

  beforeEach(async () => {
    await env.reset();

    await env.pg.query(`DELETE FROM organizations WHERE zone_id = $1`, [SANTA_ELENA_ZONE_ID]);
    orgId = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id, max_active_claims, incident_category_id)
       VALUES ($1, $2, $3, 5, NULL)`,
      [orgId, `Dept E2E ${orgId.slice(0, 8)}`, SANTA_ELENA_ZONE_ID],
    );

    categoryA = randomUUID();
    categoryB = randomUUID();
    for (const id of [categoryA, categoryB]) {
      await env.pg.query(
        `INSERT INTO incident_categories (id, name, description) VALUES ($1, $2, $3)`,
        [id, `Cat ${id.slice(0, 8)}`, 'x'],
      );
    }

    master = await env.provisionUser(['CREATE departments', 'UPDATE departments', 'READ departments'], {
      roleName: 'master',
      organizationId: orgId,
    });

    const created = await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({
        name: `Dept ${randomUUID().slice(0, 8)}`,
        organization_id: orgId,
        category_ids: [categoryA, categoryB],
      })
      .expect(201);
    deptId = created.body.id as string;
  });

  async function linkedCategories(): Promise<string[]> {
    const rows = await env.pg.query<{ incident_category_id: string }>(
      `SELECT incident_category_id
         FROM department_incident_categories
        WHERE department_id = $1
        ORDER BY incident_category_id`,
      [deptId],
    );
    return rows.rows.map((r) => r.incident_category_id);
  }

  it('create con category_ids escribe el M:N completo', async () => {
    expect(await linkedCategories()).toEqual([categoryA, categoryB].sort());
  });

  it('PATCH omittingiendo category_ids CONSERVA los vínculos', async () => {
    // El contrato central: `null` significa "no tocar". Un rename no debe
    // desconectar el departamento de sus categorías.
    await request(env.httpServer)
      .patch(`/api/departments/${deptId}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ name: `Renombrado ${randomUUID().slice(0, 8)}` })
      .expect(200);

    expect(await linkedCategories()).toEqual([categoryA, categoryB].sort());
  });

  it('PATCH con category_ids: [] los borra (semántica intencional de "wipe")', async () => {
    // La contraparte: array vacío SÍ limpia. Si alguien cambia el servicio
    // para tratar `[]` como `null`, este test falla — que es el punto.
    await request(env.httpServer)
      .patch(`/api/departments/${deptId}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ category_ids: [] })
      .expect(200);

    expect(await linkedCategories()).toEqual([]);
  });

  it('PATCH con una lista distinta REEMPLAZA, no acumula', async () => {
    await request(env.httpServer)
      .patch(`/api/departments/${deptId}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ category_ids: [categoryB] })
      .expect(200);

    expect(await linkedCategories()).toEqual([categoryB]);
  });

  it('tras un wipe, los operadores del departamento desaparecen de available-operators', async () => {
    // El efecto observable que hace que todo esto importe: perder los vínculos
    // vacía el dropdown de despacho sin que ninguna capa reporte un error.
    const adminOrg = await env.provisionUser(['READ incidents', 'ASSIGN assignments'], {
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const operator = await env.provisionUser(['READ incidents'], {
      organizationId: orgId,
      roleName: 'operator_org',
    });
    await env.pg.query(`UPDATE users SET department_id = $1 WHERE id = $2`, [deptId, operator.userId]);

    const reporter = await env.provisionUser(['CREATE incidents'], { organizationId: orgId });
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        title: 'Incidencia de categoría A',
        description: 'x',
        priority: 'high',
        category_id: categoryA,
        ...INSIDE_SANTA_ELENA,
      })
      .expect(201);

    const operators = async () => {
      const res = await request(env.httpServer)
        .get(`/api/incidents/${created.body.id}/available-operators`)
        .set({ Authorization: `Bearer ${adminOrg.accessToken}` })
        .expect(200);
      return res.body.map((o: { id: string }) => o.id);
    };

    // Con el vínculo intacto, el operador es asignable.
    expect(await operators()).toContain(operator.userId);

    // Tras el wipe, desaparece. Sin 500, sin warning: sólo un dropdown vacío.
    await request(env.httpServer)
      .patch(`/api/departments/${deptId}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ category_ids: [] })
      .expect(200);

    expect(await operators()).not.toContain(operator.userId);

    // Restaurarlo lo devuelve — el daño es reversible, sólo invisible.
    await request(env.httpServer)
      .patch(`/api/departments/${deptId}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ category_ids: [categoryA] })
      .expect(200);

    expect(await operators()).toContain(operator.userId);
  });

  it('un GET del departamento devuelve el category_ids actual', async () => {
    const res = await request(env.httpServer)
      .get(`/api/departments/${deptId}`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);

    const ids = (res.body.category_ids as string[]).sort();
    expect(ids).toEqual([categoryA, categoryB].sort());
  });
});