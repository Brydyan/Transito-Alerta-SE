import { randomUUID } from 'crypto';
import request from 'supertest';

import { TestEnvironment } from '../support/test-environment';

/**
 * ANON (sc-326) — D.2: tras cerrar el reporte sin sesión, no
 * debe existir NINGÚN camino para crear una incidencia o un
 * comentario sin una sesión autenticada.
 *
 * Este archivo es la verificación e2e de D.2: el guardia
 * `JwtAuthGuard` está enchufado en `IncidentsController` y
 * `CommentsController`, y un request sin cabecera de
 * autorización se rechaza con 401 — sin pasar por la lógica
 * de `EmailVerifiedGuard` ni por la del servicio.
 *
 * Sin este test, D.2 quedaba como afirmación estructural
 * ("grep @UseGuards" — la ronda 1 lo cerró así). El test
 * runtime lo sube de "parece enchufado" a "está enchufado
 * contra la app real".
 */
describe('E2E ANON — D.2: ninguna ruta de creación acepta requests sin token (sc-326)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    if (env) await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  function newIncident() {
    return {
      title: `Choque ${randomUUID().slice(0, 8)}`,
      description: 'Sin heridos',
      lat: -2.2267,
      lng: -80.8583,
    };
  }

  it('D.2: POST /api/incidents sin Authorization → 401 (sin token, sin sesión)', async () => {
    // La ausencia de cabecera de autorización es la
    // condición que D.2 quiere cazar. No usamos
    // `request(...).set('Authorization', 'Bearer anonymous')`
    // porque esa es otra cosa (un token inválido) y porque
    // ANON ya cortó el camino del device_uuid anónimo en
    // `AuthService.login`. Acá probamos el caso puro:
    // ni token, ni credencial.
    await request(env.httpServer)
      .post('/api/incidents')
      .send(newIncident())
      .expect(401);
  });

  it('D.2: POST /api/comments sin Authorization → 401 (sin token, sin sesión)', async () => {
    // Comentamos sobre una incidencia existente (la creamos
    // con un reporter verificado, con sesión, así el padre
    // existe). El `CommentsController` exige su propio
    // `JwtAuthGuard` a nivel de clase: la falta de
    // autorización debe rechazarse ANTES de llegar a la
    // lógica de `EmailVerifiedGuard` o del servicio.
    const reporter = await env.provisionUser(
      ['CREATE incidents', 'READ incidents', 'CREATE comments'],
      {
        email: `reporter-${randomUUID()}@example.com`,
        roleName: 'reporter',
        emailVerified: true,
      },
    );
    const auth = { Authorization: `Bearer ${reporter.accessToken}` };
    const incidente = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send(newIncident())
      .expect(201);

    // Ahora el intento SIN token. El padre existe, pero
    // `JwtAuthGuard` corre antes de cualquier otra cosa.
    await request(env.httpServer)
      .post('/api/comments')
      .send({ incident_id: incidente.body.id, content: 'Yo vi lo que pasó' })
      .expect(401);
  });

  it('D.2: GET /api/incidents (lectura) sin Authorization → 401 (lectura pública también cerrada)', async () => {
    // El producto no expone feed público en esta etapa (la
    // decisión de producto del 2026-09-02 cubre el reporte,
    // no la lectura). El feed exige sesión — un cliente
    // sin token que intente listar recibe 401 antes de que
    // `PermissionGuard` decida nada.
    await request(env.httpServer).get('/api/incidents').expect(401);
  });
});
