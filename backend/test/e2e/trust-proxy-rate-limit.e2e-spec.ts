import request from 'supertest';
import { randomUUID } from 'crypto';
import { TestEnvironment } from '../support/test-environment';

/**
 * MAIL (sc-327) — G.4: rate limit del alta por IP del cliente.
 *
 * Antes de G.1, `app.set('trust proxy', …)` no estaba
 * configurado, así que `req.ip` siempre era la dirección de la
 * conexión TCP (en el harness, `127.0.0.1`; en producción, la
 * IP del balanceador). El rate limit por IP en
 * `AuthRegisterService` agrupaba TODO el tráfico bajo una
 * misma llave: un atacante y un usuario legítimo compartían
 * el cupo de `IP_MAX = 5` intentos por hora.
 *
 * El test ejercita el efecto real: con el `trust proxy`
 * activado y dirigido a la red interna, dos clientes con
 * `X-Forwarded-For` distintos cuentan por separado. La
 * sexta llamada del cliente A recibe 429, pero la primera
 * llamada del cliente B pasa.
 *
 * **Por qué IPs en 10.0.0.0/8**: la función
 * `isTrustedProxyAddress` acepta el `X-Forwarded-For` sólo
 * cuando la conexión viene de una red interna declarada
 * (10/8, 172.16/12, 192.168/16, 127/32). El harness corre
 * en localhost (`127.0.0.1`), así que cualquier IP en
 * `X-Forwarded-For` es leída como `req.ip`. Usamos IPs en
 * 10/8 sólo por consistencia con la convención del
 * proyecto.
 */
describe('Trust proxy + rate limit del alta (MAIL G.4)', () => {
  let env: TestEnvironment;
  const base = '/api';

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    if (env) await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  it('G.4: dos clientes con X-Forwarded-For distinto NO comparten la cuenta de rate limit', async () => {
    // Dos clientes distintos, ambos llegando "a través del
    // proxy" desde la red interna de Docker. La IP del
    // cliente es lo que va en `X-Forwarded-For`.
    const clientA = `10.77.${Math.floor(Math.random() * 200) + 1}.1`;
    const clientB = `10.77.${Math.floor(Math.random() * 200) + 50}.2`;

    // 5 altas desde el cliente A — todas pasan (IP_MAX = 5).
    for (let i = 0; i < 5; i++) {
      const res = await request(env.httpServer)
        .post(`${base}/auth/register`)
        .set('X-Forwarded-For', clientA)
        .send({
          email: `g4-a-${i}-${randomUUID()}@example.com`,
          password: 'Password123!@#',
          first_name: 'A',
          last_name: `User${i}`,
        });
      expect(res.status).toBe(200);
    }

    // La sexta desde A cae en 429 (rate limit por IP).
    const blocked = await request(env.httpServer)
      .post(`${base}/auth/register`)
      .set('X-Forwarded-For', clientA)
      .send({
        email: `g4-a-blocked-${randomUUID()}@example.com`,
        password: 'Password123!@#',
        first_name: 'A',
        last_name: 'Blocked',
      });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('REGISTRATION_RATE_LIMITED');

    // La primera desde B pasa: la cuenta del rate limit es
    // por IP, no global. Si `trust proxy` estuviera mal
    // configurado, B vería `req.ip = 127.0.0.1` y heredaría
    // las 5 hits de A (que también eran 127.0.0.1 desde el
    // punto de vista de Express).
    const allowed = await request(env.httpServer)
      .post(`${base}/auth/register`)
      .set('X-Forwarded-For', clientB)
      .send({
        email: `g4-b-${randomUUID()}@example.com`,
        password: 'Password123!@#',
        first_name: 'B',
        last_name: 'User',
      });
    expect(allowed.status).toBe(200);
  }, 30_000);
});
