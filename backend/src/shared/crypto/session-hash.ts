import { createHash, timingSafeEqual } from 'crypto';

/** SHA-256 hex digest of a refresh token (T3.9 design D5) — 64 lowercase hex chars. */
export function sha256Hex(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Constant-time hex-string comparison (T3.9 design §1 [R1] — the actual
 * security compare, distinct from the CAS predicate in `rotate()`). Never
 * throws on a length mismatch or `null` input — `timingSafeEqual` itself
 * throws if buffer lengths differ, which would leak length information via
 * a distinguishable exception/branch, so the mismatch is checked and
 * short-circuited to `false` first.
 */
export function timingSafeEqualHex(a: string | null, b: string | null): boolean {
  if (a === null || b === null) {
    return false;
  }
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
