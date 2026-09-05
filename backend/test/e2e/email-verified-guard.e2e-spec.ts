import { randomUUID } from 'crypto';
import request from 'supertest';

import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * REG (sc-325) — `EmailVerifiedGuard` de punta a punta.
 *
 * D2 del design: se puede entrar y leer sin verificar el correo; NO se puede
 * publicar. La barrera existe para que el auto-registro no sea un generador
 * de cuentas desechables: si un correo inventado pudiera publicar de
 * inmediato, el sello de autoría que AUD construye para sancionar
 * información falsa no valdría nada.
 *
 * **Por qué este archivo existe además del spec unitario.**
 * `email-verified.guard.spec.ts` arma un objeto de usuario a mano, se lo pasa
 * al guard y comprueba la decisión. Eso prueba que la función decide bien —
 * no que el guard esté ENCHUFADO. Si alguien borra el
 * `@UseGuards(EmailVerifiedGuard)` de `incidents.controller.ts`, aquel spec
 * sigue en verde: la función que examina no cambió, y la regla desaparece de
 * la aplicación sin que ninguna compuerta se entere.
 *
 * No es hipotético. En la ronda 1 de este mismo change las 19 casillas
 * estaban marcadas, los unitarios en verde, y la aplicación no arrancaba
 * (`EmailVerifiedGuard` inyectaba `UserEntity` sin `forFeature`). Lo único
 * que lo detectó fue levantar la app de verdad, que es lo que hace este
 * archivo.
 */
describe('E2E REG — EmailVerifiedGuard conectado (sc-325)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  function authHeader(user: ProvisionedUser) {
    return { Authorization: `Bearer ${user.accessToken}` };
  }

  /** Coordenadas cualquiera dentro del bbox sembrado de Santa Elena. */
  const LAT = -2.2267;
  const LNG = -80.8583;

  function newIncident() {
    return {
      title: `Choque ${randomUUID().slice(0, 8)}`,
      description: 'Sin heridos',
      lat: LAT,
      lng: LNG,
    };
  }

  /**
   * Un ciudadano con el rol real `reporter` (sembrado por 0009) y los
   * permisos que necesita para publicar. Lo único que varía entre casos es
   * si tiene el correo verificado — así el 403 sólo puede venir del guard
   * bajo prueba y no del `PermissionGuard`.
   */
  function provisionReporter(emailVerified: boolean): Promise<ProvisionedUser> {
    return env.provisionUser(['CREATE incidents', 'READ incidents', 'CREATE comments'], {
      email: `ciudadano-${randomUUID()}@example.com`,
      roleName: 'reporter',
      emailVerified,
    });
  }

  it('reporter SIN verificar no puede crear una incidencia (403 EMAIL_VERIFICATION_REQUIRED)', async () => {
    const reporter = await provisionReporter(false);

    const res = await request(env.httpServer)
      .post('/api/incidents')
      .set(authHeader(reporter))
      .send(newIncident())
      .expect(403);

    // El código importa tanto como el estado: un 403 del `PermissionGuard`
    // también sería 403, y este test estaría verde por el motivo equivocado.
    expect(res.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
  });

  it('el mismo reporter, ya verificado, sí puede crear la incidencia', async () => {
    const reporter = await provisionReporter(true);

    await request(env.httpServer)
      .post('/api/incidents')
      .set(authHeader(reporter))
      .send(newIncident())
      .expect(201);
  });

  it('reporter SIN verificar puede LEER — la barrera está en publicar, no en entrar (D2)', async () => {
    const reporter = await provisionReporter(false);

    await request(env.httpServer)
      .get('/api/incidents')
      .set(authHeader(reporter))
      .expect(200);
  });

  it('staff SIN verificar publica igual — la allow-list lo exime', async () => {
    const operador = await env.provisionUser(['CREATE incidents', 'READ incidents'], {
      email: `operador-${randomUUID()}@example.com`,
      roleName: 'operador_org',
      emailVerified: false,
    });

    await request(env.httpServer)
      .post('/api/incidents')
      .set(authHeader(operador))
      .send(newIncident())
      .expect(201);
  });

  /**
   * El defecto recurrente de este proyecto es una regla aplicada en un sitio
   * y no en su vecino. `POST /comments` lleva el mismo guard que
   * `POST /incidents`; si alguien lo quita de uno solo, esto lo dice.
   */
  it('reporter SIN verificar tampoco puede comentar', async () => {
    const autor = await provisionReporter(true);
    const incidente = await request(env.httpServer)
      .post('/api/incidents')
      .set(authHeader(autor))
      .send(newIncident())
      .expect(201);

    const reporter = await provisionReporter(false);

    const res = await request(env.httpServer)
      .post('/api/comments')
      .set(authHeader(reporter))
      .send({ incident_id: incidente.body.id, content: 'Yo vi lo que pasó' })
      .expect(403);

    expect(res.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
  });
});
