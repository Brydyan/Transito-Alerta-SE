import { randomUUID } from 'crypto';
import * as request from 'supertest';

import { TelegramService } from '../../src/modules/telegram/telegram.service';
import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * 2026-10-20 — E2E del flujo de despacho completo, de punta a punta.
 *
 * Cubre la cadena que une TODOS los módulos que tocamos en el incident del
 * `/auth/me` 500, y que ningún spec existente recorre junta:
 *
 *   crear departamento (con sus categorías)
 *     → publicar incidencia crítica (geofence resuelve la org)
 *       → admin_org recibe el aviso de Telegram por la creación
 *         → available-operators devuelve al operador de ese departamento
 *           → admin_org asigna
 *             → el operador recibe su aviso de Telegram
 *
 * ── Por qué este spec y no más unitarios ────────────────────────────────────
 *
 * Los specs existentes usan `env.provisionUser(perms)` y nunca siembran
 * `departments` ni `department_incident_categories`. Es decir: prueban que el
 * CÓDIGO funciona con datos bien formados. Los dos fallos que nos kilaron
 * fueron de FORMA de datos:
 *
 *   - `users.permissions` con `resource:ACTION` (migración 0021) → 500 en
 *     `/auth/me`, imposible de reproducir sin sembrar ese formato.
 *   - `department_incident_categories` vacía → `available-operators` devuelve
 *     `[]` aunque haya operadores activos en la org.
 *
 * Y `departments.e2e-spec.ts:65-67` gatea sus 10 escenarios detrás de
 * `process.env.RUN_DEPT_E2E`, así que el módulo entero no corre en CI por
 * omisión. Este spec no depende de ese flag.
 *
 * ── Qué afirma además de lo obvio ─────────────────────────────────────────
 *
 * El link de Telegram. Los tres listeners armaban `/incidents/:id`, ruta que
 * no existe; sus propios specs afirmaban la ruta rota. Aquí el enlace sale
 * por HTTP real y se compara contra el árbol de rutas de Angular.
 */

const SANTA_ELENA_ZONE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';
const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

describe('E2E despacho — departamento → publicación → asignación → Telegram', () => {
  let env: TestEnvironment;
  let telegram: TelegramService;
  let enqueueSpy: jest.SpyInstance;

  beforeAll(async () => {
    env = await TestEnvironment.start();
    telegram = env.app.get(TelegramService);
  }, 120_000);

  afterAll(async () => {
    await env?.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
    enqueueSpy = jest.spyOn(telegram, 'enqueue');
  });

  afterEach(() => {
    enqueueSpy.mockRestore();
  });

  /** Espera a que el outbox reciba al menos un mensaje (listener asíncrono). */
  async function waitForTelegram(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (enqueueSpy.mock.calls.length > 0) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('timeout esperando enqueue de Telegram');
  }

  function textsTo(chatId: string): string[] {
    return enqueueSpy.mock.calls
      .filter((c) => c[0].chat_id === chatId)
      .map((c) => c[0].text as string);
  }

  /**
   * Org en la zona de Santa Elena. `incident_category_id = NULL` la hace
   * transversal: matchea cualquier categoría, así el geofence resuelve esta
   * org sin depender del catálogo sembrado.
   */
  async function seedOrg(): Promise<string> {
    await env.pg.query(`DELETE FROM organizations WHERE zone_id = $1`, [
      SANTA_ELENA_ZONE_ID,
    ]);
    const orgId = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id, max_active_claims, incident_category_id)
       VALUES ($1, $2, $3, 5, NULL)`,
      [orgId, `E2E Despacho ${orgId.slice(0, 8)}`, SANTA_ELENA_ZONE_ID],
    );
    return orgId;
  }

  async function seedCategory(name: string): Promise<string> {
    const id = randomUUID();
    await env.pg.query(
      `INSERT INTO incident_categories (id, name, description)
       VALUES ($1, $2, $3)`,
      [id, name, 'Categoría de prueba e2e'],
    );
    return id;
  }

  it('flujo completo: dept con categoría → crítica → admin_org avisa → asigna → operador avisa', async () => {
    const orgId = await seedOrg();
    const categoryId = await seedCategory(`Colisión E2E ${categoryIdSuffix()}`);

    // ── 1. master crea el departamento VINCULANDO la categoría ────────────
    //
    // `category_ids` es el campo que escribe en `department_incident_categories`
    // (departments.repository.ts:293). Es exactamente el vínculo que faltaba
    // en staging y que dejó `available-operators` vacío.
    const master = await env.provisionUser(
      ['CREATE departments', 'READ departments'],
      { roleName: 'master', organizationId: orgId },
    );

    const dept = await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({
        name: `OIAT E2E ${categoryIdSuffix()}`,
        description: 'Departamento de prueba',
        organization_id: orgId,
        category_ids: [categoryId],
      })
      .expect(201);

    const departmentId = dept.body.id as string;
    expect(departmentId).toBeDefined();

    // El vínculo debe existir de verdad, no sólo aceptarse en el DTO.
    const links = await env.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM department_incident_categories
        WHERE department_id = $1 AND incident_category_id = $2`,
      [departmentId, categoryId],
    );
    expect(links[0].n).toBe(1);

    // ── 2. Los tres actores ────────────────────────────────────────────────
    //
    // `telegram_chat_id` y `department_id` se siembran por SQL: el listener
    // aborta en silencio si falta el chat id (`incident-assigned.listener.ts`
    // :57-62), y sin chat id el test pasaría sin ejercitar nada.
    const reporter: ProvisionedUser = await env.provisionUser(['CREATE incidents'], {
      email: 'reporter-despacho@example.com',
      organizationId: orgId,
      roleName: 'reporter',
    });

    const ADMIN_CHAT = '111111';
    const adminOrg: ProvisionedUser = await env.provisionUser(
      ['READ incidents', 'ASSIGN assignments'],
      { email: 'admin-despacho@example.com', organizationId: orgId, roleName: 'admin_org' },
    );
    await env.pg.query(`UPDATE users SET telegram_chat_id = $1 WHERE id = $2`, [
      ADMIN_CHAT,
      adminOrg.userId,
    ]);

    const OPERATOR_CHAT = '222222';
    const operator: ProvisionedUser = await env.provisionUser(
      ['READ incidents', 'UPDATE incidents'],
      { email: 'operator-despacho@example.com', organizationId: orgId, roleName: 'operator_org' },
    );
    await env.pg.query(
      `UPDATE users SET telegram_chat_id = $1, department_id = $2 WHERE id = $3`,
      [OPERATOR_CHAT, departmentId, operator.userId],
    );

    // ── 3. El ciudadano publica una incidencia CRÍTICA de esa categoría ─────
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        title: 'Colisión con heridos',
        description: 'Dos vehículos, un herido leve',
        priority: 'critical',
        category_id: categoryId,
        ...INSIDE_SANTA_ELENA,
      })
      .expect(201);

    const incidentId = created.body.id as string;

    // El geofence tiene que resolver la org: sin esto los dos listeners
    // hacen `return` temprano y el test "pasa" sin enviar nada.
    expect(created.body.organization_id).toBe(orgId);
    expect(created.body.category_id).toBe(categoryId);

    // ── 4. Telegram avisa al admin_org por la creación crítica ──────────────
    await waitForTelegram();
    const adminTexts = textsTo(ADMIN_CHAT);
    expect(adminTexts.length).toBeGreaterThan(0);
    expect(adminTexts.join('\n')).toContain('Colisión con heridos');
    expect(adminTexts.join('\n')).toContain(`/app/incidencias/${incidentId}`);
    // El reporter nunca debe recibir el aviso de emergencia. No tiene
    // `telegram_chat_id`, así que el fan-out no puede alcanzarlo; se verifica
    // contando destinatarios en vez de por identidad.
    const recipientsAtCreation = new Set(
      enqueueSpy.mock.calls.map((c) => c[0].chat_id as string),
    );
    expect([...recipientsAtCreation]).toEqual([ADMIN_CHAT]);
    expect(reporter.userId).toBeDefined();

    // ── 5. available-operators devuelve al operador de ese departamento ────
    //
    // Este es el assertion que falla si `department_incident_categories` no
    // enlaza el departamento con la categoría: el filtro `department_id IN
    // (category_depts)` deja al operador fuera y devuelve `[]`
    // (incident-workflow.service.ts:295-326).
    const available = await request(env.httpServer)
      .get(`/api/incidents/${incidentId}/available-operators`)
      .set({ Authorization: `Bearer ${adminOrg.accessToken}` })
      .expect(200);

    expect(available.body.map((o: { id: string }) => o.id)).toContain(operator.userId);

    // ── 6. El admin asigna la incidencia al operador ───────────────────────
    await request(env.httpServer)
      .post('/api/assignments')
      .set({ Authorization: `Bearer ${adminOrg.accessToken}` })
      .send({ incident_id: incidentId, operator_id: operator.userId })
      .expect(201);

    // ── 7. Telegram avisa al operador asignado ─────────────────────────────
    await waitForTelegram();
    const opTexts = textsTo(OPERATOR_CHAT);
    expect(opTexts.length).toBeGreaterThan(0);

    const opMessage = opTexts.join('\n');
    expect(opMessage).toContain('Colisión con heridos');
    expect(opMessage).toContain('Dos vehículos, un herido leve');
    expect(opMessage).toContain('maps.google.com');
    // El enlace al detalle — el bug que arreglamos en los tres listeners.
    expect(opMessage).toContain(`/app/incidencias/${incidentId}`);
    expect(opMessage).not.toMatch(/\/incidents\//);
  });

  it('un operador de un departamento que NO maneja la categoría NO aparece', async () => {
    // Contracara del anterior: el filtro no es un no-op que devuelve todo.
    const orgId = await seedOrg();
    const handled = await seedCategory(`Atropello E2E ${categoryIdSuffix()}`);
    const other = await seedCategory(`Siniestros E2E ${categoryIdSuffix()}`);

    const master = await env.provisionUser(['CREATE departments'], {
      roleName: 'master',
      organizationId: orgId,
    });

    const deptA = await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ name: `Dept A ${categoryIdSuffix()}`, organization_id: orgId, category_ids: [handled] })
      .expect(201);
    const deptB = await request(env.httpServer)
      .post('/api/departments')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ name: `Dept B ${categoryIdSuffix()}`, organization_id: orgId, category_ids: [other] })
      .expect(201);

    const adminOrg = await env.provisionUser(['READ incidents'], {
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const operatorA = await env.provisionUser(['READ incidents'], {
      organizationId: orgId,
      roleName: 'operator_org',
    });
    const operatorB = await env.provisionUser(['READ incidents'], {
      organizationId: orgId,
      roleName: 'operator_org',
    });
    await env.pg.query(`UPDATE users SET department_id = $1 WHERE id = $2`, [
      deptA.body.id,
      operatorA.userId,
    ]);
    await env.pg.query(`UPDATE users SET department_id = $1 WHERE id = $2`, [
      deptB.body.id,
      operatorB.userId,
    ]);

    const reporter = await env.provisionUser(['CREATE incidents'], { organizationId: orgId });
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        title: 'Atropello',
        description: 'peatón',
        priority: 'high',
        category_id: handled,
        ...INSIDE_SANTA_ELENA,
      })
      .expect(201);

    const available = await request(env.httpServer)
      .get(`/api/incidents/${created.body.id}/available-operators`)
      .set({ Authorization: `Bearer ${adminOrg.accessToken}` })
      .expect(200);

    const ids = available.body.map((o: { id: string }) => o.id);
    expect(ids).toContain(operatorA.userId);
    expect(ids).not.toContain(operatorB.userId);
  });

  it('un operador sin department_id sigue apareciendo (fallback polivalente)', async () => {
    // La rama `u.department_id IS NULL` de
    // incident-workflow.service.ts:323-326. Un operador sin dept debe ser
    // asignable aunque la categoría la maneje otro departamento.
    const orgId = await seedOrg();
    const categoryId = await seedCategory(`Genérica E2E ${categoryIdSuffix()}`);

    const adminOrg = await env.provisionUser(['READ incidents'], {
      organizationId: orgId,
      roleName: 'admin_org',
    });
    const polyvalente = await env.provisionUser(['READ incidents'], {
      organizationId: orgId,
      roleName: 'operator_org',
    });

    const reporter = await env.provisionUser(['CREATE incidents'], { organizationId: orgId });
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        title: 'Sin dept asignable',
        description: 'x',
        priority: 'medium',
        category_id: categoryId,
        ...INSIDE_SANTA_ELENA,
      })
      .expect(201);

    const available = await request(env.httpServer)
      .get(`/api/incidents/${created.body.id}/available-operators`)
      .set({ Authorization: `Bearer ${adminOrg.accessToken}` })
      .expect(200);

    expect(available.body.map((o: { id: string }) => o.id)).toContain(polyvalente.userId);
  });
});

/** Sufijo único por seed — los `name` de categorías/departos son únicos. */
function categoryIdSuffix(): string {
  return randomUUID().slice(0, 8);
}