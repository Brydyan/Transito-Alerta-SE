import { createHash } from 'crypto';
import { sha256Hex, timingSafeEqualHex } from './session-hash';

describe('sha256Hex (T3.9 design D5)', () => {
  it('produces a 64-char lowercase hex digest', () => {
    const digest = sha256Hex('some-refresh-token');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    expect(sha256Hex('token-a')).toBe(sha256Hex('token-a'));
  });

  it('differs for different inputs', () => {
    expect(sha256Hex('token-a')).not.toBe(sha256Hex('token-b'));
  });

  it('matches Node crypto\'s own SHA-256 digest (no reimplementation drift)', () => {
    expect(sha256Hex('some-refresh-token')).toBe(
      createHash('sha256').update('some-refresh-token', 'utf8').digest('hex'),
    );
  });
});

describe('timingSafeEqualHex (T3.9 design §1 [R1] — no mocks, no timing assertions)', () => {
  const hashA = sha256Hex('token-a');
  const hashB = sha256Hex('token-b');

  it('returns true for identical hex strings', () => {
    expect(timingSafeEqualHex(hashA, hashA)).toBe(true);
  });

  it('returns false for different hex strings of the same length', () => {
    expect(timingSafeEqualHex(hashA, hashB)).toBe(false);
  });

  it('returns false, never throws, on a length mismatch', () => {
    expect(() => timingSafeEqualHex(hashA, 'ab')).not.toThrow();
    expect(timingSafeEqualHex(hashA, 'ab')).toBe(false);
  });

  it('returns false when either side is null', () => {
    expect(timingSafeEqualHex(null, hashA)).toBe(false);
    expect(timingSafeEqualHex(hashA, null)).toBe(false);
    expect(timingSafeEqualHex(null, null)).toBe(false);
  });

  it('returns false, never throws, on garbage (non-hex) input', () => {
    expect(() => timingSafeEqualHex('not-hex-!!', hashA)).not.toThrow();
  });
});
