import { isWithinRotationGrace, ACTIVE_SESSION_SQL } from './session-validity';

describe('ACTIVE_SESSION_SQL (design §4 D11 predicate)', () => {
  it('is the exact, single-sourced predicate string', () => {
    expect(ACTIVE_SESSION_SQL).toBe(
      'revoked_at IS NULL AND expires_at > now() AND refresh_token_hash IS NOT NULL',
    );
  });
});

describe('isWithinRotationGrace (T3.9 design §7 / §10 — pure, no timers)', () => {
  const t0 = new Date('2026-08-17T12:00:00.000Z');

  it('returns false when rotatedAt is null (never rotated)', () => {
    expect(isWithinRotationGrace(null, t0, 30)).toBe(false);
  });

  it('returns true exactly at the boundary (elapsed === grace)', () => {
    const now = new Date(t0.getTime() + 30_000);
    expect(isWithinRotationGrace(t0, now, 30)).toBe(true);
  });

  it('returns false just past the boundary (elapsed === grace + 1ms rounds up)', () => {
    const now = new Date(t0.getTime() + 30_001);
    expect(isWithinRotationGrace(t0, now, 30)).toBe(false);
  });

  it('returns true for elapsed === 0 with any non-negative grace', () => {
    expect(isWithinRotationGrace(t0, t0, 0)).toBe(true);
  });

  it('grace === 0 rejects any real elapsed time (unmitigated reuse detection)', () => {
    const now = new Date(t0.getTime() + 1);
    expect(isWithinRotationGrace(t0, now, 0)).toBe(false);
  });

  it('negative skew (now before rotatedAt) is never treated as in-window', () => {
    const now = new Date(t0.getTime() - 5_000);
    expect(isWithinRotationGrace(t0, now, 30)).toBe(false);
  });

  it('well within the window returns true', () => {
    const now = new Date(t0.getTime() + 15_000);
    expect(isWithinRotationGrace(t0, now, 30)).toBe(true);
  });

  it('well past the window returns false', () => {
    const now = new Date(t0.getTime() + 60_000);
    expect(isWithinRotationGrace(t0, now, 30)).toBe(false);
  });
});
