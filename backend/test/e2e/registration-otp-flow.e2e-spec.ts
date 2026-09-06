import { randomUUID } from 'crypto';
import request from 'supertest';

import { TestEnvironment } from '../support/test-environment';
import { MailService } from '../../src/modules/mail/mail.service';

/**
 * REG (sc-325) — C.8: ciclo completo del ciudadano nuevo, de punta
 * a punta, contra la app real.
 *
 * **Por qué este archivo existe.**
 *
 * El defecto B.6 de la ronda 0 fue que la pantalla `/verify-email`
 * se marcó como hecha cuando en realidad no existía el componente
 * (sólo un `.html` heredado de sc-117). El verificador del pass 5
 * lo cazó abriendo la carpeta. Ningún e2e lo cazó porque ningún
 * e2e recorría el camino: `register → login → intentar publicar →
 * 403 → verificar → publicar`. C.8 es ese camino.
 *
 * Es la tarea más importante del grupo C. Cubre las dos verificaciones
 * que el change debe sostener:
 *
 *  1. El `EmailVerifiedGuard` está ENCHUFADO y bloquea a un
 *     `reporter` recién registrado (D2: se puede entrar, no se
 *     puede publicar).
 *  2. Verificar el OTP quita la barrera (el ciudadano puede
 *     publicar después).
 *
 * Afirmaciones sobre el código de error (`EMAIL_VERIFICATION_REQUIRED`)
 * y no sólo sobre el status 403 — un 403 del `PermissionGuard`
 * también sería 403, y este test estaría verde por el motivo
 * equivocado. Es la misma lección que el `email-verified-guard.e2e-spec.ts`
 * aplicó en la ronda 4.
 *
 * **Cómo se obtiene el OTP.** El backend lo guarda hasheado
 * (`sha256(otp)`) en `users.verification_otp`. El texto plano
 * sale por el mailer; el e2e espía `MailService.enqueue` y lo
 * lee del payload, como ya hace
 * `email-verification.e2e-spec.ts:74-101`.
 */
describe('E2E REG — ciclo completo register → verificar → publicar (C.8)', () => {
  let env: TestEnvironment;
  let mailService: MailService;
  const base = '/api';

  beforeAll(async () => {
    env = await TestEnvironment.start();
    mailService = env.app.get(MailService);
  }, 120_000);

  afterAll(async () => {
    if (env) await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
    jest.restoreAllMocks();
  });

  function newIncident() {
    return {
      title: `Choque ${randomUUID().slice(0, 8)}`,
      description: 'Sin heridos',
      lat: -2.2267,
      lng: -80.8583,
    };
  }

  it('C.8: el ciudadano nuevo NO puede publicar hasta verificar, y verificar lo habilita', async () => {
    const email = `ciclo-${randomUUID()}@example.com`;
    const password = 'TestPassword123!';

    // 1. Alta pública — D3 devuelve mensaje estándar, no
    //    distingue "nuevo" de "existente". El OTP se emite
    //    en el mailer; el espía lo lee del payload.
    const enqueueSpy = jest.spyOn(mailService, 'enqueue');
    await request(env.httpServer)
      .post(`${base}/auth/register`)
      .send({ email, password, first_name: 'Ada', last_name: 'Lovelace' })
      .expect(200);

    const registerCall = enqueueSpy.mock.calls.find(
      (c) => (c[0].data as { otp?: string }).otp !== undefined,
    );
    expect(registerCall).toBeDefined();
    const otp = (registerCall![0].data as { otp: string }).otp;
    expect(otp).toMatch(/^\d{6}$/);

    // 2. Login con email + contraseña — la respuesta trae el
    //    `access_token` que el resto del flujo usa como JWT.
    const loginRes = await request(env.httpServer)
      .post(`${base}/auth/login`)
      .send({ email, password })
      .expect(200);
    const accessToken = loginRes.body.access_token;
    const auth = { Authorization: `Bearer ${accessToken}` };

    // 3. Intentar publicar — debe ser 403 con código
    //    `EMAIL_VERIFICATION_REQUIRED`. Un 403 genérico
    //    podría venir del `PermissionGuard` y el test
    //    pasaría por el motivo equivocado.
    const forbidden = await request(env.httpServer)
      .post(`${base}/incidents`)
      .set(auth)
      .send(newIncident())
      .expect(403);
    expect(forbidden.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');

    // 4. Verificar el OTP — 200 + `verified: true`.
    const verifyRes = await request(env.httpServer)
      .post(`${base}/email/verify-otp`)
      .set(auth)
      .send({ otp })
      .expect(200);
    expect(verifyRes.body.verified).toBe(true);

    // 5. Publicar de nuevo — ahora 201. La barrera está
    //    cerrada para el siguiente caso, pero la cuenta
    //    sigue siendo la misma.
    await request(env.httpServer)
      .post(`${base}/incidents`)
      .set(auth)
      .send(newIncident())
      .expect(201);

    // 6. La fila en la BD tiene `email_verified_at` poblado.
    //    La verificación por la BD es la que importa: un mock
    //    de la respuesta HTTP no probaría nada.
    const { rows } = await env.pg.query<{ email_verified_at: Date | null }>(
      `SELECT email_verified_at FROM users WHERE email = $1`,
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email_verified_at).not.toBeNull();
  });

  it('C.8: `/auth/me` informa `email_verified: false` antes y `true` después de verificar', async () => {
    const email = `me-${randomUUID()}@example.com`;
    const password = 'TestPassword123!';
    const enqueueSpy = jest.spyOn(mailService, 'enqueue');

    await request(env.httpServer)
      .post(`${base}/auth/register`)
      .send({ email, password, first_name: 'Ada', last_name: 'Lovelace' })
      .expect(200);

    const otp = (
      enqueueSpy.mock.calls.find(
        (c) => (c[0].data as { otp?: string }).otp !== undefined,
      )![0].data as { otp: string }
    ).otp;

    const loginRes = await request(env.httpServer)
      .post(`${base}/auth/login`)
      .send({ email, password })
      .expect(200);
    const auth = { Authorization: `Bearer ${loginRes.body.access_token}` };

    // ANTES — el frontend usará este booleano (C.4) para
    // decidir si redirige al composer del OTP. Si dice
    // `true` antes de verificar, C.4 no funciona.
    const meBefore = await request(env.httpServer)
      .get(`${base}/auth/me`)
      .set(auth)
      .expect(200);
    expect(meBefore.body.email_verified).toBe(false);

    await request(env.httpServer)
      .post(`${base}/email/verify-otp`)
      .set(auth)
      .send({ otp })
      .expect(200);

    // DESPUÉS — el booleano refleja el cambio. El frontend
    // puede confiar en él.
    const meAfter = await request(env.httpServer)
      .get(`${base}/auth/me`)
      .set(auth)
      .expect(200);
    expect(meAfter.body.email_verified).toBe(true);
  });

  /**
   * REG Fix A (ronda 10) — `/auth/me` debe exponer `role_name` para
   * que `LoginComponent` (C.4) pueda decidir el redirect al composer
   * del OTP. El escenario "Llegar sin buscar" del spec se cumple si
   * y sólo si este campo llega poblado con `'reporter'`.
   *
   * Sin este fix, el signal `user` del frontend hardcodeaba
   * `roleName: null` y la condición del redirect era siempre
   * `false` — el `reporter` sin verificar terminaba en el dashboard
   * en vez del composer, y la verificación nunca pasaba del
   * "esperando que el ciudadano busque la pantalla".
   */
  it('Fix A: `/auth/me` expone `role_name: "reporter"` tras alta pública', async () => {
    const email = `role-${randomUUID()}@example.com`;
    const password = 'TestPassword123!';

    await request(env.httpServer)
      .post(`${base}/auth/register`)
      .send({ email, password, first_name: 'Ada', last_name: 'Lovelace' })
      .expect(200);

    const loginRes = await request(env.httpServer)
      .post(`${base}/auth/login`)
      .send({ email, password })
      .expect(200);
    const auth = { Authorization: `Bearer ${loginRes.body.access_token}` };

    const me = await request(env.httpServer)
      .get(`${base}/auth/me`)
      .set(auth)
      .expect(200);

    // El campo está y refleja el nombre del rol que
    // `AuthRegisterService` le asignó a la cuenta.
    expect(me.body.role_name).toBe('reporter');
    // Y la combinación que C.4 lee en el frontend:
    expect(me.body.role_name).toBe('reporter');
    expect(me.body.email_verified).toBe(false);
  });
});
