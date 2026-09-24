export declare const SESSION_REQUIRED = "SESSION_REQUIRED";
export declare const SESSION_REVOKED = "SESSION_REVOKED";
export declare const SESSION_REUSE_DETECTED = "SESSION_REUSE_DETECTED";
export declare const SESSION_USER_MISMATCH = "SESSION_USER_MISMATCH";
export declare const SESSION_RETRY_UNAVAILABLE = "SESSION_RETRY_UNAVAILABLE";
export type SessionErrorCode = typeof SESSION_REQUIRED | typeof SESSION_REVOKED | typeof SESSION_REUSE_DETECTED | typeof SESSION_USER_MISMATCH | typeof SESSION_RETRY_UNAVAILABLE;
export interface SessionErrorBody {
    code: SessionErrorCode;
    message: string;
}
