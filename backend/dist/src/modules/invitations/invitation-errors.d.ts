export declare const INVITATION_NOT_FOUND = "INVITATION_NOT_FOUND";
export declare const INVITATION_ALREADY_USED = "INVITATION_ALREADY_USED";
export declare const INVITATION_EXPIRED = "INVITATION_EXPIRED";
export declare const RESET_TOKEN_CONSUMED = "RESET_TOKEN_CONSUMED";
export declare const RESET_TOKEN_EXPIRED = "RESET_TOKEN_EXPIRED";
export declare const OUT_OF_SCOPE_ORGANIZATION = "OUT_OF_SCOPE_ORGANIZATION";
export type InvitationErrorCode = typeof INVITATION_NOT_FOUND | typeof INVITATION_ALREADY_USED | typeof INVITATION_EXPIRED | typeof RESET_TOKEN_CONSUMED | typeof RESET_TOKEN_EXPIRED | typeof OUT_OF_SCOPE_ORGANIZATION;
export interface InvitationErrorBody {
    code: InvitationErrorCode;
    message: string;
}
