export declare const ACTIVE_SESSION_SQL = "revoked_at IS NULL AND expires_at > now() AND refresh_token_hash IS NOT NULL";
export declare function isWithinRotationGrace(rotatedAt: Date | null, now: Date, graceSeconds: number): boolean;
