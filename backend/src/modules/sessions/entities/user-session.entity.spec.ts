import { UserSessionEntity } from './user-session.entity';

/**
 * Table-driven — must agree with `ACTIVE_SESSION_SQL`
 * (`sessions/session-validity.ts`) on all 3 independent clauses
 * (T3.9 design §4/§10).
 */
describe('UserSessionEntity.isValid (mirrors ACTIVE_SESSION_SQL, D11)', () => {
  const now = new Date('2026-08-17T12:00:00.000Z');
  const future = new Date(now.getTime() + 60_000);
  const past = new Date(now.getTime() - 60_000);

  function makeSession(overrides: Partial<UserSessionEntity> = {}): UserSessionEntity {
    const session = new UserSessionEntity();
    session.id = 'session-1';
    session.userId = 'user-1';
    session.deviceUuid = 'device-1';
    session.createdAt = past;
    session.refreshTokenHash = 'a'.repeat(64);
    session.previousRefreshTokenHash = null;
    session.rotatedAt = null;
    session.ipAddress = null;
    session.userAgent = null;
    session.revokedAt = null;
    session.lastUsedAt = null;
    session.expiresAt = future;
    Object.assign(session, overrides);
    return session;
  }

  it('is valid when not revoked, not expired, and hash present', () => {
    expect(makeSession().isValid(now)).toBe(true);
  });

  it('is invalid when revoked_at is set (clause 1)', () => {
    expect(makeSession({ revokedAt: past }).isValid(now)).toBe(false);
  });

  it('is invalid when expires_at is in the past (clause 2)', () => {
    expect(makeSession({ expiresAt: past }).isValid(now)).toBe(false);
  });

  it('is invalid when expires_at is exactly now (strict > required)', () => {
    expect(makeSession({ expiresAt: now }).isValid(now)).toBe(false);
  });

  it('is invalid when expires_at is null (never set)', () => {
    expect(makeSession({ expiresAt: null }).isValid(now)).toBe(false);
  });

  it('is invalid when refresh_token_hash is null (clause 3 — legacy pre-0016 row)', () => {
    expect(makeSession({ refreshTokenHash: null }).isValid(now)).toBe(false);
  });

  it('a legacy row fails on two independent clauses simultaneously', () => {
    const legacy = makeSession({ refreshTokenHash: null, expiresAt: past });
    expect(legacy.isValid(now)).toBe(false);
    expect(legacy.refreshTokenHash).toBeNull();
    expect(legacy.expiresAt!.getTime()).toBeLessThan(now.getTime());
  });
});
