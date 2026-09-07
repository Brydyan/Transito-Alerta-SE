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
   * El caso que separa una política de la otra.
   *
   * La ronda 3 de este change invirtió el guard a lista negra
   * (`roleName !== 'reporter' → pasa`). Con esa forma, renombrar el rol
   * `reporter` desde el panel de administración —un cambio cosmético, sin
   * error y sin log— desactivaba la verificación para toda la base de
   * ciudadanos: los permisos quedaban intactos, `role_deleted_at` seguía en
   * `null`, y lo único que cambiaba era el nombre.
   *
   * Con la lista blanca actual, un nombre desconocido cae del lado de
   * exigencia. Este test es el que lo distingue: pasa con allow-list, falla
   * con deny-list.
   *
   * Se renombra ANTES de provisionar al ciudadano a propósito.
   * `RolesService.update()` no invalida el cache de permisos —a diferencia
   * de `delete()`, que sí lo hace—, así que renombrar con una sesión ya
   * abierta devolvería 403 por el contexto viejo en Redis: verde por el
   * motivo equivocado. Provisionar después fuerza un contexto fresco y deja
   * que el 403 venga de donde tiene que venir.
   */
  it('un rol nuevo con CREATE incidents NO entra a la allow-list: el ciudadano sigue necesitando verificar', async () => {
    // AUD (sc-327) FIX-6 (ronda 12) — el round 0 de este test
    // hacía un renombrado de `reporter` a `ciudadano` para
    // demostrar que el `EmailVerifiedGuard` filtra por NOMBRE
    // y que un nombre desconocido cae del lado de exigencia.
    // FIX-6 prohíbe renombrar roles sembrados (porque un
    // rename es un vector de privilege-escalation), así que
    // el setup del round 0 ya no es legal.
    //
    // El invariante que el test afirma (allow-list por
    // nombre, deny-by-default) sigue siendo verdadero, y se
    // demuestra con un CREATE de un rol nuevo con permisos
    // equivalentes a `reporter` (CREATE incidents). Si el
    // guard filtra por nombre, un rol distinto de
    // `master`/`admin_sistema`/`operador_sistema` no entra a
    // la allow-list y el ciudadano debe verificar.
    const admin = await env.provisionUser(['READ roles', 'CREATE roles'], {
      email: `admin-${randomUUID()}@example.com`,
      roleName: 'master',
      emailVerified: true,
    });
    const authHeader = (u: { accessToken: string }) => ({
      Authorization: `Bearer ${u.accessToken}`,
    });

    const newRoleName = `ciudadano-${randomUUID().slice(0, 8)}`;
    const newRoleRes = await request(env.httpServer)
      .post('/api/roles')
      .set(authHeader(admin))
      .send({ name: newRoleName, permissions: ['CREATE incidents'] });
    expect(newRoleRes.status).toBe(201);

    try {
      const renombrado = await env.provisionUser(['CREATE incidents'], {
        email: `ciudadano-${randomUUID()}@example.com`,
        roleName: newRoleName,
        emailVerified: false,
      });

      const res = await request(env.httpServer)
        .post('/api/incidents')
        .set(authHeader(renombrado))
        .send(newIncident())
        .expect(403);

      expect(res.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    } finally {
      // `reset()` trunca usuarios, incidencias y comentarios
      // pero NO `roles` (costo fijo del harness para tests
      // que dependen de la presencia de `reporter`).
      // Soft-delete del rol creado por el test para no
      // contaminar el walk del WARNING-A.6, que asume
      // `deleted_at IS NULL`.
      await env.pg.query(
        `UPDATE roles SET deleted_at = now() WHERE name = $1`,
        [newRoleName],
      );
    }
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
