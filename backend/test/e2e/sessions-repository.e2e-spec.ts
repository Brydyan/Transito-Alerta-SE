import { randomUUID } from 'crypto';

import { SessionsRepository } from '../../src/modules/sessions/sessions.repository';
import { TestEnvironment } from '../support/test-environment';

/**
 * SessionsRepository integration (T3.9 design §1/§10, task 7.7) — the only
 * place the CAS rotation SQL is exercised against a REAL Postgres. Unit
 * tests (sessions.repository.spec.ts) only prove the SQL string shape;
 * this proves the row-lock/EvalPlanQual behaviour the design's §1 argument
 * depends on actually holds.
 */
describe('SessionsRepository — CAS integration (T3.9 design §1, real Postgres)', () => {
  let env: TestEnvironment;
  let repo: SessionsRepository;

  beforeAll(async () => {
    env = await TestEnvironment.start();
    repo = env.app.get(SessionsRepository);
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  async function makeUser(): Promise<string> {
    const { rows } = await env.pg.query<{ id: string }>(
      `INSERT INTO users (device_uuid, permissions, is_active) VALUES ($1, '[]'::jsonb, true) RETURNING id`,
      [`cas-user-${randomUUID()}`],
    );
    return rows[0].id;
  }

  it('two concurrent rotate() calls on one session: exactly one returns a row', async () => {
    const userId = await makeUser();
    const currentHash = 'a'.repeat(64);
    const session = await repo.create({
      id: randomUUID(),
      userId,
      deviceUuid: 'device-cas',
      refreshTokenHash: currentHash,
      ipAddress: null,
      userAgent: null,
      ttlSeconds: 604800,
    });

    const [resultA, resultB] = await Promise.all([
      repo.rotate({
        id: session.id,
        newHash: 'winner-hash-a'.padEnd(64, '0'),
        expectedHash: currentHash,
        ttlSeconds: 604800,
        ipAddress: null,
        userAgent: null,
      }),
      repo.rotate({
        id: session.id,
        newHash: 'winner-hash-b'.padEnd(64, '0'),
        expectedHash: currentHash,
        ttlSeconds: 604800,
        ipAddress: null,
        userAgent: null,
      }),
    ]);

    const winners = [resultA, resultB].filter((r) => r !== null);
    expect(winners).toHaveLength(1);

    const finalRow = await repo.findActiveById(session.id);
    expect(finalRow!.previous_refresh_token_hash).toBe(currentHash);
  });

  it('findActiveByUser excludes revoked, expired, and legacy (NULL-hash) rows', async () => {
    const userId = await makeUser();

    const active = await repo.create({
      id: randomUUID(),
      userId,
      deviceUuid: 'device-active',
      refreshTokenHash: 'b'.repeat(64),
      ipAddress: null,
      userAgent: null,
      ttlSeconds: 604800,
    });

    const revoked = await repo.create({
      id: randomUUID(),
      userId,
      deviceUuid: 'device-revoked',
      refreshTokenHash: 'c'.repeat(64),
      ipAddress: null,
      userAgent: null,
      ttlSeconds: 604800,
    });
    await repo.revoke(revoked.id);

    const expired = await repo.create({
      id: randomUUID(),
      userId,
      deviceUuid: 'device-expired',
      refreshTokenHash: 'd'.repeat(64),
      ipAddress: null,
      userAgent: null,
      ttlSeconds: -10, // already expired
    });

    // Legacy pre-0016 row: created directly, bypassing the repository
    // (which always writes a hash) — the exact shape a 0006-era row has.
    const { rows: legacyRows } = await env.pg.query<{ id: string }>(
      `INSERT INTO user_sessions (user_id, device_uuid) VALUES ($1, 'device-legacy') RETURNING id`,
      [userId],
    );
    const legacyId = legacyRows[0].id;

    const activeSessions = await repo.findActiveByUser(userId);
    const activeIds = activeSessions.map((s) => s.id);

    expect(activeIds).toContain(active.id);
    expect(activeIds).not.toContain(revoked.id);
    expect(activeIds).not.toContain(expired.id);
    expect(activeIds).not.toContain(legacyId);
  });

  it('migration 0016 applied twice is idempotent and backfills legacy rows correctly', async () => {
    const userId = await makeUser();
    const { rows } = await env.pg.query<{ id: string }>(
      `INSERT INTO user_sessions (user_id, device_uuid) VALUES ($1, 'device-legacy-2') RETURNING id`,
      [userId],
    );
    const legacyId = rows[0].id;

    // Re-run 0016 against the already-migrated schema (idempotence).
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const sql = readFileSync(
      join(__dirname, '../../../database/migrations/0016_sessions_revocation.sql'),
      'utf8',
    );
    await env.pg.query(sql);

    const { rows: after } = await env.pg.query<{
      expires_at: Date;
      created_at: Date;
      refresh_token_hash: string | null;
    }>('SELECT expires_at, created_at, refresh_token_hash FROM user_sessions WHERE id = $1', [
      legacyId,
    ]);

    expect(after[0].refresh_token_hash).toBeNull();
    expect(new Date(after[0].expires_at).getTime()).toBe(new Date(after[0].created_at).getTime());
  });
});
