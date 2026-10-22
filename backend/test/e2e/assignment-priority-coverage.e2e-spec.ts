import { randomUUID } from 'crypto';
import request from 'supertest';

import { TelegramService } from '../../src/modules/telegram/telegram.service';
import { pollForNotification } from '../support/notification-poller';
import { TestEnvironment } from '../support/test-environment';

/**
 * 2026-10-21 — E2E de la ruta de asignación por `admin_org` para las
 * prioridades `low` y `medium`.
 *
 * ## Lo que faltaba
 *
 * `dispatch-workflow.e2e-spec.ts` recorre la cadena completa SOLO para
 * `priority: 'critical'`. La razón está en `critical-incident.listener.ts:79`
 * (`if (payload.priority !== 'critical') return;`): la fan-out de
 * Telegram al `admin_org` por creación de incidencia es exclusiva de
 * critical. Pero esa exclusividad, como toda guarda de prioridad, es
 * un punto de falla silencioso: si alguien cambia la condición y notifica
 * también a low/medium, nadie lo nota hasta que el admin se queja de
 * spam. Y al revés: si alguien quita el `'critical'` y deja que TODAS
 * las prioridades disparen la fan-out, tampoco lo notamos.
 *
 * El otro hueco era más llano: las prioridades no-críticas nunca
 * recorrían de punta a punta la ruta de asignación manual. Hoy un
 * admin_org puede asignar una `low` o `medium` y el operador la recibe,
 * pero "puede" no estaba verificado contra la BD — sólo el path de
 * critical lo estaba.
 *
 * ## La asimetría que se valida
 *
 * Test 1 (low) y test 2 (medium) son estructuralmente idénticos excepto
 * por la prioridad. Si en algún momento alguien mueve `critical` a un
 * helper y "olvida" extender las otras prioridades, este spec
 * rompe exactamente ahí: la asignación seguiría funcionando, pero el
 * admin_org que se queja de no recibir avisos de otras prioridades lo
 * rompe.
 *
 * ## Aislamiento entre tests
 *
 * Cada test crea su propia org en la zona sembrada (`SANTA_ELENA`) y
 * sus tres usuarios. `beforeEach` hace `env.reset()`, que trunca las
 * tablas transaccionales — el patrón es el mismo que en `assignment-cap`
 * y `dispatch-workflow`.
 */

const SANTA_ELENA_ZONE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';
const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

describe('E2E prioridad — admin_org asigna low y medium', () => {
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

  /**
   * Da tiempo al listener `@OnEvent('incident.created')` a correr
   * (EventEmitter2 no es awaited; el handler se ejecuta en su propia
   * promesa). Si la condición de prioridad está mal y dispara para
   * low/medium, lo verá el `enqueueSpy` cuando se resuelva.
   *
   * 2026-10-22 — este `setTimeout(200)` fijo era una apuesta: la
   * aserción que acompaña es NEGATIVA (`toEqual([])`), así que un plazo
   * corto la hace pasar por la razón equivocada cuando el listener
   * todavía no corrió. 2s da margen de sobra para un handler que en
   * local tarda <5ms y en CI puede tardar cientos, sin volver el test
   * lento cuando la guarda de prioridad funciona (que es el caso normal:
   * el listener retorna en microsegundos y el sleep se paga entero).
   */
  async function waitForIncidentCreatedHandler(): Promise<void> {
    await new Promise((r) => setTimeout(r, 2_000));
  }

  function enqueueCallsTo(chatId: string): Array<{ text: string }> {
    return enqueueSpy.mock.calls
      .filter((c) => (c[0] as { chat_id: string }).chat_id === chatId)
      .map((c) => ({ text: (c[0] as { text: string }).text }));
  }

  async function seedOrg(): Promise<string> {
    await env.pg.query(`DELETE FROM organizations WHERE zone_id = $1`, [
      SANTA_ELENA_ZONE_ID,
    ]);
    const orgId = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id, max_active_claims, incident_category_id)
       VALUES ($1, $2, $3, 5, NULL)`,
      [orgId, `Priority E2E ${orgId.slice(0, 8)}`, SANTA_ELENA_ZONE_ID],
    );
    return orgId;
  }

  it(`priority='low' — admin_org asigna, operador recibe in-app, admin NO recibe Telegram de creación`, async () => {
    const orgId = await seedOrg();
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `prio-low-reporter-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'reporter',
    });
    const ADMIN_CHAT = '111111';
    const adminOrg = await env.provisionUser(['READ incidents', 'ASSIGN assignments'], {
      email: `prio-low-admin-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'admin_org',
    });
    await env.pg.query(`UPDATE users SET telegram_chat_id = $1 WHERE id = $2`, [
      ADMIN_CHAT,
      adminOrg.userId,
    ]);
    const operator = await env.provisionUser(['READ incidents', 'UPDATE incidents'], {
      email: `prio-low-op-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'operator_org',
    });

    // ── Creación: low NO debe disparar Telegram al admin_org ─────────────
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        title: 'Bache en la avenida',
        description: 'Un bache tamaño rueda',
        priority: 'low',
        ...INSIDE_SANTA_ELENA,
      })
      .expect(201);

    expect(created.body.organization_id).toBe(orgId);
    const incidentId = created.body.id as string;

    // Esperar el handler del listener. Si el guard de prioridad se rompe
    // y empieza a notificar también a low, este spy lo captura.
    await waitForIncidentCreatedHandler();
    expect(enqueueCallsTo(ADMIN_CHAT)).toEqual([]);

    // ── Asignación manual por admin_org ──────────────────────────────────
    await request(env.httpServer)
      .post('/api/assignments')
      .set({ Authorization: `Bearer ${adminOrg.accessToken}` })
      .send({ incident_id: incidentId, operator_id: operator.userId })
      .expect(201);

    // ── Fila de asignación + notificación in-app al operador ─────────────
    const assignments = await env.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM assignments WHERE incident_id = $1 AND operator_id = $2`,
      [incidentId, operator.userId],
    );
    expect(assignments.rows[0].n).toBe(1);

    // 2026-10-22 — era `SELECT count(*)` de una sola vez. El listener de
    // `incident.assigned` corre detrás de `EventEmitter2.emit()`, que no
    // awaita: el 201 del POST arrive antes del INSERT. En local ganaba la
    // carrera por poco; en el shard 1/4 de CI perdía y el test caía con
    // `Expected: 1, Received: 0`. Ahora espera activa.
    const notif = await pollForNotification(env.pg, {
      userId: operator.userId,
      incidentId,
      type: 'incident.assigned',
    });
    expect(notif).not.toBeNull();
    expect(notif!.message).toContain('Bache en la avenida');
  });

  it(`priority='medium' — admin_org asigna, operador recibe in-app, admin NO recibe Telegram de creación`, async () => {
    const orgId = await seedOrg();
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `prio-med-reporter-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'reporter',
    });
    const ADMIN_CHAT = '333333';
    const adminOrg = await env.provisionUser(['READ incidents', 'ASSIGN assignments'], {
      email: `prio-med-admin-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'admin_org',
    });
    await env.pg.query(`UPDATE users SET telegram_chat_id = $1 WHERE id = $2`, [
      ADMIN_CHAT,
      adminOrg.userId,
    ]);
    const operator = await env.provisionUser(['READ incidents', 'UPDATE incidents'], {
      email: `prio-med-op-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'operator_org',
    });

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        title: 'Vehículo varado',
        description: 'Vehículo varado bloquea carril derecho',
        priority: 'medium',
        ...INSIDE_SANTA_ELENA,
      })
      .expect(201);

    expect(created.body.organization_id).toBe(orgId);
    const incidentId = created.body.id as string;

    await waitForIncidentCreatedHandler();
    expect(enqueueCallsTo(ADMIN_CHAT)).toEqual([]);

    await request(env.httpServer)
      .post('/api/assignments')
      .set({ Authorization: `Bearer ${adminOrg.accessToken}` })
      .send({ incident_id: incidentId, operator_id: operator.userId })
      .expect(201);

    const assignments = await env.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM assignments WHERE incident_id = $1 AND operator_id = $2`,
      [incidentId, operator.userId],
    );
    expect(assignments.rows[0].n).toBe(1);

    // Misma espera activa que el test de `low` (ver el comentario allá).
    const notif = await pollForNotification(env.pg, {
      userId: operator.userId,
      incidentId,
      type: 'incident.assigned',
    });
    expect(notif).not.toBeNull();
    expect(notif!.message).toContain('Vehículo varado');
  });
});
