import { mapStatusLabel } from './incident-status.util';

/**
 * 2026-10-06-incident-images-read-path (D5) — the spec covers the
 * four canonical statuses plus the unknown-key fallback that
 * protects legacy / future status strings (e.g. `previous_status`
 * values that predate the current 4-state machine).
 */
describe('mapStatusLabel (2026-10-06-incident-images-read-path)', () => {
  it.each([
    ['pending', 'Pendiente'],
    ['in_progress', 'En proceso'],
    ['resolved', 'Resuelto'],
    ['closed', 'Cerrada'],
  ] as const)('maps "%s" → "%s"', (input, expected) => {
    expect(mapStatusLabel(input)).toBe(expected);
  });

  it('returns the raw input for unknown keys (legacy / future statuses)', () => {
    // The timeline may surface states outside the canonical 4-state
    // machine. We don't want a hard crash — pass them through.
    expect(mapStatusLabel('on_hold')).toBe('on_hold');
    expect(mapStatusLabel('archived')).toBe('archived');
    expect(mapStatusLabel('')).toBe('');
  });

  it('does not throw on null / undefined by mapping the raw value', () => {
    // The TS signature requires a string — but JS callers (e.g.
    // Angular templates that pass `entry?.previous_status` where the
    // optional field is missing) can still pass `undefined`. The
    // function MUST not crash; the fallback handles it.
    expect(mapStatusLabel(undefined as unknown as string)).toBeUndefined();
    expect(mapStatusLabel(null as unknown as string)).toBeNull();
  });
});