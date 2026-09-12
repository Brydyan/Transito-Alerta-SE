import request from 'supertest';

import { TestEnvironment } from '../support/test-environment';

/**
 * F6 (`2026-09-11-f6-audit-logs-export`) — e2e STUB.
 *
 * Scenarios covered by `specs/audit-logs-api/spec.md`:
 *
 *   R1-S4  Unauthenticated request → 401 (no JWT)
 *   R1-S5  Authenticated, no permission → 403
 *   R3-S1  Authenticated master → 200 + Content-Type: text/csv
 *   R3-S3  Dataset > 10k rows → exactly 10k rows exported, no error
 *   R4-S5  Migration 0053 idempotent: ON CONFLICT (resource, action)
 *         DO NOTHING keeps a single permission row
 *   R5-S2  AuditModule not registered in AppModule → 404 on
 *         /api/audit-logs. Verifiable by reading app.module.ts
 *         (already verified by hand in apply-progress.md — see
 *         Phase 4 task 4.1).
 *
 * The full scenarios live here as STUBS: the harness setup is
 * in place (TestEnvironment.start / stop, env.reset) so the next
 * round of F6 work can flesh them out against the real PG +
 * Redis + Nest pipeline without re-doing the wiring. Running
 * this file today requires the docker testcontainers stack
 * (same as `audit-trail-reveal.e2e-spec.ts`); CI's `migrations`
 * job doesn't run the e2e harness, so this file is not in the
 * unit-test gate.
 */
describe('E2E audit-logs export (F6 — stub)', () => {
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

  // R1-S4 — no JWT, expect 401 from JwtAuthGuard
  it('STUB R1-S4: GET /api/audit-logs without a JWT returns 401', async () => {
    await request(env.httpServer).get('/api/audit-logs').expect(401);
  });

  // R1-S5 — JWT present but missing the permission, expect 403
  it('STUB R1-S5: GET /api/audit-logs with a user lacking READ audit-logs returns 403', async () => {
    const user = await env.provisionUser(['READ incidents'], {
      email: `noperm-${Date.now()}@example.com`,
      roleName: 'operador_org',
    });
    await request(env.httpServer)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(403);
  });

  // R3-S1 — master user, expect text/csv body and Content-Disposition
  it('STUB R3-S1: GET /api/audit-logs/export.csv as master returns 200 + text/csv', async () => {
    const master = await env.provisionUser(['READ audit-logs'], {
      email: `master-${Date.now()}@example.com`,
      roleName: 'master',
    });
    const res = await request(env.httpServer)
      .get('/api/audit-logs/export.csv')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="audit-logs-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  // R3-S3 — cap at 10k rows (would seed 10k+ audit rows in the full e2e)
  it('STUB R3-S3: dataset > 10k rows is capped at 10k with no error', async () => {
    // Stub: full implementation requires seeding 10001 audit rows
    // via env.pg, which is the next F6 iteration's job.
    const master = await env.provisionUser(['READ audit-logs'], {
      email: `master-cap-${Date.now()}@example.com`,
      roleName: 'master',
    });
    await request(env.httpServer)
      .get('/api/audit-logs/export.csv')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .expect(200);
  });

  // Limit cap — spec R1-S3 (architect chose Option A in sdd-verify
  // FIX-1): the DTO rejects `limit=200` with 400 BEFORE the service
  // runs. ValidationPipe enforces @Max(100). Fail-fast is the
  // architect's choice over silent cap.
  it('STUB DTO limit: GET /api/audit-logs?limit=200 returns 400 (DTO @Max(100))', async () => {
    const master = await env.provisionUser(['READ audit-logs'], {
      email: `master-limit-${Date.now()}@example.com`,
      roleName: 'master',
    });
    await request(env.httpServer)
      .get('/api/audit-logs?limit=200')
      .set('Authorization', `Bearer ${master.accessToken}`)
      .expect(400);
  });

  // R4-S5 — migration idempotency: re-running 0053 must NOT
  // duplicate the permission row. The full check is in the
  // Phase 3 task 3.2 in tasks.md — this stub asserts that the
  // catalog row is queryable with the expected (resource,
  // action) pair post-start.
  it('STUB R4-S5: migration 0053 leaves exactly one (audit-logs, READ) row in permissions', async () => {
    const rows = await env.pg.query(
      `SELECT id FROM permissions
        WHERE resource = 'audit-logs' AND action = 'READ'
          AND deleted_at IS NULL`,
    );
    expect(rows.rows).toHaveLength(1);
  });
});
