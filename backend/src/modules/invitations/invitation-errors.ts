/**
 * INVITATION_* / RESET_TOKEN_* error codes (T3.6 design "Error Map"). Mirrors
 * `sessions/session-errors.ts`'s pattern. `INSUFFICIENT_ROLE_RANK` is
 * intentionally NOT re-declared here — it is reused verbatim from
 * `assert-can-manage.ts`/`assertCanGrantRole` (design corrections table).
 */
export const INVITATION_NOT_FOUND = 'INVITATION_NOT_FOUND';
export const INVITATION_ALREADY_USED = 'INVITATION_ALREADY_USED';
export const INVITATION_EXPIRED = 'INVITATION_EXPIRED';
export const RESET_TOKEN_CONSUMED = 'RESET_TOKEN_CONSUMED';
export const RESET_TOKEN_EXPIRED = 'RESET_TOKEN_EXPIRED';
export const OUT_OF_SCOPE_ORGANIZATION = 'OUT_OF_SCOPE_ORGANIZATION';

export type InvitationErrorCode =
  | typeof INVITATION_NOT_FOUND
  | typeof INVITATION_ALREADY_USED
  | typeof INVITATION_EXPIRED
  | typeof RESET_TOKEN_CONSUMED
  | typeof RESET_TOKEN_EXPIRED
  | typeof OUT_OF_SCOPE_ORGANIZATION;

export interface InvitationErrorBody {
  code: InvitationErrorCode;
  message: string;
}
