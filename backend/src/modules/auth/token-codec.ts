import { randomBytes } from 'crypto';
import { BadRequestException } from '@nestjs/common';

import { INVALID_TOKEN } from './auth-errors';

/** 32 random bytes, base64url-encoded — the plaintext token mailed to the invitee (design D4). */
const TOKEN_BYTES = 32;

/**
 * Token codec (T3.6 design D4) — pure, no I/O. `generateToken()` produces
 * the plaintext link token; `decodeTokenOrThrow` validates a presented
 * token is a well-formed base64url string of the right byte length before
 * it is hashed and looked up. Reuses `sha256Hex`/`timingSafeEqualHex` from
 * `common/crypto/session-hash.ts` verbatim for the hash/compare step — no
 * new hash primitives here.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * `400 INVALID_TOKEN` on anything that isn't a valid base64url encoding of
 * exactly `TOKEN_BYTES` bytes — malformed input never reaches the DB
 * lookup. Returns the decoded token string itself (still hashed by the
 * caller before use), not the raw bytes — callers hash the STRING form,
 * matching `generateToken`'s output shape.
 */
export function decodeTokenOrThrow(token: string): string {
  if (!token || typeof token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new BadRequestException({ code: INVALID_TOKEN, message: 'Malformed token' });
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(token, 'base64url');
  } catch {
    throw new BadRequestException({ code: INVALID_TOKEN, message: 'Malformed token' });
  }
  if (decoded.length !== TOKEN_BYTES) {
    throw new BadRequestException({ code: INVALID_TOKEN, message: 'Malformed token' });
  }
  return token;
}
