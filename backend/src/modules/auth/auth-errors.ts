/**
 * AUTH_* error codes (T3.6 design "Error Map"). Mirrors
 * `sessions/session-errors.ts`'s pattern — defined once here and imported
 * everywhere else instead of re-typing string literals, so a typo cannot
 * silently create an unmatched code.
 */
export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
export const INVALID_CREDENTIAL_SHAPE = 'INVALID_CREDENTIAL_SHAPE';
export const INVALID_TOKEN = 'INVALID_TOKEN';
export const EMAIL_ALREADY_CLAIMED = 'EMAIL_ALREADY_CLAIMED';

export type AuthErrorCode =
  | typeof INVALID_CREDENTIALS
  | typeof INVALID_CREDENTIAL_SHAPE
  | typeof INVALID_TOKEN
  | typeof EMAIL_ALREADY_CLAIMED;

export interface AuthErrorBody {
  code: AuthErrorCode;
  message: string;
}
