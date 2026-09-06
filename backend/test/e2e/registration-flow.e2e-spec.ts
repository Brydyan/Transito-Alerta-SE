import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';
import { randomUUID } from 'crypto';

/**
 * REG (sc-325) — Fix 9 (ronda 6) — e2e propio del alta pública.
 *
 * Este e2e existía como deuda desde la ronda 1. El verificador del
 * pass 5 documentó: "Lo que lo habría cazado es la deuda que el
 * propio verify dejó anotada: ningún e2e ejercita
 * `POST /auth/register` de punta a punta. El hueco de cobertura
 * y el defecto son el mismo hueco."
 *
 * Misma estructura que `email-verification.e2e-spec.ts`: la app
 * real, sin mocks. Verifica con la cuenta creada en la BD (no con
 * la respuesta del endpoint, que es opaca por D3).
 */
describe('REG — flujo de alta pública (e2e)', () => {
  let env: TestEnvironment;
  const base = '/api';

  beforeAll(async () => {
    env = await TestEnvironment.start();
  });

  afterAll(async () => {
    if (env) await env.stop();
  });

  it('REG.1: POST /auth/register con correo nuevo crea la cuenta con rol `reporter` y emite OTP', async () => {
    const email = `reg-${randomUUID()}@example.com`;
    const password = 'TestPassword123!';
    const first_name = 'Ada';
    const last_name = 'Lovelace';

    // D3 — la respuesta es la misma forma, el cliente no puede
    // distinguir. La verificación del éxito viene de la BD.
    const res = await request(env.httpServer)
      .post(`${base}/auth/register`)
      .send({ email, password, first_name, last_name })
      .expect(200);

    expect(res.body.message).toMatch(/te enviamos un mensaje/);

    // Verificación end-to-end: la cuenta existe con rol `reporter`,
    // sin `email_verified_at`, con OTP emitido (no verificable
    // sin mailer, pero el campo existe).
    const { rows } = await env.pg.query<{
      role_id: string;
      role_name: string;
      email_verified_at: Date | null;
      verification_otp: string | null;
    }>(
      `SELECT u.role_id, u.email_verified_at, u.verification_otp,
              r.name AS role_name
         FROM users u LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.email = $1`,
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].role_name).toBe('reporter');
    expect(rows[0].email_verified_at).toBeNull();
    expect(rows[0].verification_otp).toBeTruthy();
  });

  it('REG.2: D3 — POST /auth/register con correo existente devuelve la misma forma y NO crea cuenta duplicada', async () => {
    const email = `dup-${randomUUID()}@example.com`;
    const password = 'TestPassword123!';
    const first_name = 'First';
    const last_name = 'Last';

    // Primer alta: crea la cuenta.
    const first = await request(env.httpServer)
      .post(`${base}/auth/register`)
      .send({ email, password, first_name, last_name })
      .expect(200);

    // Segunda alta con el mismo correo: la respuesta es la misma
    // (D3, indistinguible), y la cuenta original sigue siendo una
    // sola fila.
    const second = await request(env.httpServer)
      .post(`${base}/auth/register`)
      .send({ email, password, first_name, last_name })
      .expect(200);

    expect(second.body).toEqual(first.body);

    const { rows } = await env.pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE email = $1`,
      [email],
    );
    expect(rows[0].count).toBe('1');
  });

  it('REG.3: D1 — el body no acepta `role`/`roleName`/`permissions`/`organization_id` (falla con 400)', async () => {
    const email = `strict-${randomUUID()}@example.com`;
    const password = 'TestPassword123!';
    const first_name = 'Strict';
    const last_name = 'User';

    // El backend declara el DTO con `whitelist: true` +
    // `forbidNonWhitelisted`, así que cualquier campo extra se
    // rechaza ANTES de tocar el service. Verificamos que el
    // intento de escalar privilegios falla.
    await request(env.httpServer)
      .post(`${base}/auth/register`)
      .send({
        email,
        password,
        first_name,
        last_name,
        role: 'master', // intento de escalada
        permissions: ['*'],
        organization_id: 'org-staff',
      })
      .expect(400);

    // Defensa en profundidad: aunque el whitelist fallara, la
    // cuenta NO se creó.
    const { rows } = await env.pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE email = $1`,
      [email],
    );
    expect(rows[0].count).toBe('0');
  });
});
