export declare class InvitationEntity {
    id: string;
    email: string;
    roleId: string;
    organizationId: string | null;
    tokenHash: string;
    acceptedAt: Date | null;
    expiresAt: Date;
    invitedByUserId: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
