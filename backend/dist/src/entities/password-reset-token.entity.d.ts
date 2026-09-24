export declare class PasswordResetTokenEntity {
    id: string;
    userId: string;
    tokenHash: string;
    usedAt: Date | null;
    expiresAt: Date;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
