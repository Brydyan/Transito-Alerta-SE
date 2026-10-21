import { randomUUID } from 'crypto';
import request from 'supertest';

import { TestEnvironment } from '../support/test-environment';

/**
 * 2026-10-21 — E2E de la cadena "seguir incidencia → cambio de status →
 * notificación al follower".
 *
 * ## Por qué este spec
 *
 * `IncidentSocialController` expone `POST /api/incidents/:id/followers`
 * (incident-social.controller.ts:13) y `IncidentNotificationsListener.
 * onIncidentStatusChanged` (incident-notifications.listener.ts:138-176)
 * resuelve la audiencia como reporter ∪ assignee ∪ `incident_followers`.
 * La convención del payload (`actor_id`, `citizen_id`, `assigned_to`) y
 * la query `SELECT user_id FROM incident_followers` están todas en su
 * sitio — pero ningún e2e recorre la cadena. Mismo patrón que el cap:
 * la lógica existe, el contrato entre productor y consumidor está
 * arreglado, y el listener silencia los errores en un `catch` que loguea
 * y sigue. Si alguien cambia el shape del payload o el nombre de la
 * tabla, la fila de `notifications` deja de escribirse y nadie lo nota
 * hasta que un admin_org reclama en producción.
 *
 * ## Restricción de permisos
 *
 * La migración 0027 (`database/migrations/0027_citizen_social_features.sql
 * :64-66`) otorga `CREATE/DELETE incident-followers` sólo a los roles
 * `master / agent_system / admin_org / operator_org` — NO a
 * `reporter`. Esto significa que en este proyecto "seguir una incidencia"
 * es un acto administrativo: lo hace un operador o un admin. El test
 * usa `admin_org` como follower y como actor (otro admin_org) porque es
 * el rol con todos los permisos que necesitamos (`UPDATE incidents` +
 * `CREATE/DELETE incident-followers`).
 *
 * ## Asincronía del listener
 *
 * `EventEmitter2.emit()` no es awaited por el `changeStatus()` que
 * dispara el evento, así que el INSERT en `notifications` puede no
 * existir un instante después del PATCH. Igual que en
 * `dispatch-workflow.e2e-spec.ts`: sesondeo la tabla con timeout en
 * lugar de `await new Promise(setImmediate)`.
 *
 * ## Lo que NO cubre este spec
 *
 * El otro consumidor de `incident.status_changed` es el listener de
 * correo (`IncidentMailListener`, no el de notificaciones in-app).
 * Ese flujo va por el stream de Redis (`incidents:events`) y tiene su
 * propia dedup por outbox. El canal de mail se prueba en
 * `mail.e2e-spec.ts`. Aquí sólo nos interesa el canal in-app.
 */

const SANTA_ELENA_ZONE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';
const INSIDE_SANTA_ELENA = { lat: -2.2, lng: -80.5 };

describe('E2E follow de incidencia — cambio de status notifica al follower', () => {
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

  async function seedOrg(): Promise<string> {
    await env.pg.query(`DELETE FROM organizations WHERE zone_id = $1`, [
      SANTA_ELENA_ZONE_ID,
    ]);
    const orgId = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id, max_active_claims, incident_category_id)
       VALUES ($1, $2, $3, 5, NULL)`,
      [orgId, `Follow E2E ${orgId.slice(0, 8)}`, SANTA_ELENA_ZONE_ID],
    );
    return orgId;
  }

  /**
   * Sesondea la tabla `notifications` con timeout. Devuelve la primera fila
   * que matchee o `null` si pasó el plazo.
   *
   * El dedup de `NotificationsService.notify` (60s) NO afecta este spec:
   * cada test hace a lo sumo UN cambio de status y la fila esperada es
   * exactamente UNA por usuario.
   */
  async function pollForNotification(
    userId: string,
    incidentId: string,
    timeoutMs = 15_000,
  ): Promise<{ id: string; type: string; message: string; data: unknown } | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await env.pg.query<{
        id: string;
        type: string;
        message: string;
        data: unknown;
      }>(
        `SELECT id, type, message, data
           FROM notifications
          WHERE user_id = $1
            AND incident_id = $2
            AND type = 'incident.status_changed'
            AND deleted_at IS NULL`,
        [userId, incidentId],
      );
      if (rows.rows[0]) return rows.rows[0];
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  }

  it('follower recibe notification al cambiar status, reporter y assignee también', async () => {
    const orgId = await seedOrg();
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `follow-r1-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'reporter',
    });
    const follower = await env.provisionUser(
      [
        'READ incidents',
        'UPDATE incidents',
        'CREATE incident-followers',
        'DELETE incident-followers',
      ],
      {
        email: `follow-f1-${randomUUID().slice(0, 6)}@example.com`,
        organizationId: orgId,
        roleName: 'admin_org',
      },
    );
    const actor = await env.provisionUser(['READ incidents', 'UPDATE incidents'], {
      email: `follow-a1-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'admin_org',
    });

    // Reporter crea la incidencia.
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        title: 'Poste caído en la ciclovía',
        description: 'Cierra media ciclovía',
        priority: 'medium',
        ...INSIDE_SANTA_ELENA,
      })
      .expect(201);

    const incidentId = created.body.id as string;
    expect(created.body.organization_id).toBe(orgId);

    // Follower se subscribe. 200 (controlador usa HttpCode OK).
    await request(env.httpServer)
      .post(`/api/incidents/${incidentId}/followers`)
      .set({ Authorization: `Bearer ${follower.accessToken}` })
      .expect(200);

    const followRow = await env.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM incident_followers
        WHERE incident_id = $1 AND user_id = $2`,
      [incidentId, follower.userId],
    );
    expect(followRow.rows[0].n).toBe(1);

    // Actor cambia el status: pending → in_progress (transición válida
    // sin `CLOSE incidents`). El listener publica con `actor_id` del
    // actor — esa es la única fuente de verdad de "quién hizo el cambio".
    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set({ Authorization: `Bearer ${actor.accessToken}` })
      .send({ status: 'in_progress' })
      .expect(200);

    // El reporter es audiencia (citizen_id == reporter.userId).
    const reporterNotif = await pollForNotification(reporter.userId, incidentId);
    expect(reporterNotif).not.toBeNull();
    expect(reporterNotif!.message).toContain('in_progress');

    // El follower recibe por incident_followers.
    const followerNotif = await pollForNotification(follower.userId, incidentId);
    expect(followerNotif).not.toBeNull();
    expect(followerNotif!.message).toContain('in_progress');

    // El assignee NO está asignado en este test — no debe recibir fila
    // (aunque el listener lo filtraría también si fuera null).
    const assigneeNotif = await env.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM notifications
        WHERE user_id = $1 AND incident_id = $2
          AND type = 'incident.status_changed' AND deleted_at IS NULL`,
      [actor.userId, incidentId],
    );
    expect(assigneeNotif.rows[0].n).toBe(0);
  });

  it('el actor del cambio NO recibe su propia notificación (exclusion por actor_id)', async () => {
    const orgId = await seedOrg();
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `follow-r2-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'reporter',
    });
    // El actor en este test es un admin_org SIN followers propios: ni
    // siquiera la audiencia ampliada lo incluiría. Esto aísla el
    // assert: si llegara una fila para él, sería sólo por una falla
    // del filtro de exclusión por `actor_id`.
    const actor = await env.provisionUser(['READ incidents', 'UPDATE incidents'], {
      email: `follow-a2-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'admin_org',
    });

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        title: 'Semáforo intermitente',
        description: 'Parpadea en amarillo',
        priority: 'low',
        ...INSIDE_SANTA_ELENA,
      })
      .expect(201);
    const incidentId = created.body.id as string;

    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set({ Authorization: `Bearer ${actor.accessToken}` })
      .send({ status: 'in_progress' })
      .expect(200);

    // Reporter recibe (es `citizen_id`).
    const reporterNotif = await pollForNotification(reporter.userId, incidentId);
    expect(reporterNotif).not.toBeNull();

    // Actor NO recibe: el listener filtra por `id !== actor_id`.
    // Le doy timeout completo — si llegara, sería un bug.
    const actorNotif = await pollForNotification(actor.userId, incidentId, 1_000);
    expect(actorNotif).toBeNull();
  });

  it('unfollow antes del cambio: follower deja de recibir la próxima notificación', async () => {
    const orgId = await seedOrg();
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `follow-r3-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'reporter',
    });
    const follower = await env.provisionUser(
      [
        'READ incidents',
        'UPDATE incidents',
        'CREATE incident-followers',
        'DELETE incident-followers',
      ],
      {
        email: `follow-f3-${randomUUID().slice(0, 6)}@example.com`,
        organizationId: orgId,
        roleName: 'admin_org',
      },
    );
    const actor = await env.provisionUser(['READ incidents', 'UPDATE incidents'], {
      email: `follow-a3-${randomUUID().slice(0, 6)}@example.com`,
      organizationId: orgId,
      roleName: 'admin_org',
    });

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({
        title: 'Charco profundo',
        description: 'Acumulación de agua en carril',
        priority: 'low',
        ...INSIDE_SANTA_ELENA,
      })
      .expect(201);
    const incidentId = created.body.id as string;

    // Follow.
    await request(env.httpServer)
      .post(`/api/incidents/${incidentId}/followers`)
      .set({ Authorization: `Bearer ${follower.accessToken}` })
      .expect(200);

    // Unfollow antes del cambio.
    await request(env.httpServer)
      .delete(`/api/incidents/${incidentId}/followers`)
      .set({ Authorization: `Bearer ${follower.accessToken}` })
      .expect(200);

    const followCount = await env.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM incident_followers
        WHERE incident_id = $1 AND user_id = $2`,
      [incidentId, follower.userId],
    );
    expect(followCount.rows[0].n).toBe(0);

    // Cambio de status.
    await request(env.httpServer)
      .patch(`/api/incidents/${incidentId}/status`)
      .set({ Authorization: `Bearer ${actor.accessToken}` })
      .send({ status: 'in_progress' })
      .expect(200);

    // Reporter sí recibe. Le doy timeout completo al follower antes de
    // afirmar — si recibiera, sería un bug del filtro.
    const reporterNotif = await pollForNotification(reporter.userId, incidentId);
    expect(reporterNotif).not.toBeNull();

    const followerNotif = await pollForNotification(follower.userId, incidentId, 1_000);
    expect(followerNotif).toBeNull();
  });
});
