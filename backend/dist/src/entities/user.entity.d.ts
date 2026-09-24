export declare class UserEntity {
    id: string;
    deviceUuid: string | null;
    permissions: string[];
    isActive: boolean;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    email: string | null;
    passwordHash: string | null;
    role: string;
    organizationId: string | null;
    roleId: string | null;
    permissionVersion: number;
    emailVerifiedAt: Date | null;
    verificationOtp: string | null;
    verificationOtpExpiresAt: Date | null;
    termsAcceptedAt: Date | null;
    termsVersion: string | null;
    deletedAt: Date | null;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
}
