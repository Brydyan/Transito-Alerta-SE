/**
 * SESSION_* error codes (T3.9 design §6 table). All are surfaced as HTTP
 * 401 with a `{ code, message }` body — precedent: `assertCanGrantRole`'s
 * `{ code: 'INSUFFICIENT_ROLE_RANK' }` shape.
 *
 * Defined once here and imported everywhere else instead of re-typing the
 * string literals, so a typo cannot silently create a 6th, unmatched code.
 */
export const SESSION_REQUIRED = 'SESSION_REQUIRED';
export const SESSION_REVOKED = 'SESSION_REVOKED';
export const SESSION_REUSE_DETECTED = 'SESSION_REUSE_DETECTED';
export const SESSION_USER_MISMATCH = 'SESSION_USER_MISMATCH';
export const SESSION_RETRY_UNAVAILABLE = 'SESSION_RETRY_UNAVAILABLE';

export type SessionErrorCode =
  | typeof SESSION_REQUIRED
  | typeof SESSION_REVOKED
  | typeof SESSION_REUSE_DETECTED
  | typeof SESSION_USER_MISMATCH
  | typeof SESSION_RETRY_UNAVAILABLE;

export interface SessionErrorBody {
  code: SessionErrorCode;
  message: string;
}
