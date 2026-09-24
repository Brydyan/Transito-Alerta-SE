export declare class UserSessionEntity {
    id: string;
    userId: string;
    deviceUuid: string | null;
    createdAt: Date;
    refreshTokenHash: string | null;
    previousRefreshTokenHash: string | null;
    rotatedAt: Date | null;
    ipAddress: string | null;
    userAgent: string | null;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    deletedAt: Date | null;
    updatedAt: Date;
    isValid(now: Date): boolean;
}
