import { DataSource, EntityManager } from 'typeorm';
export interface InvitationRow {
    id: string;
    email: string;
    role_id: string;
    organization_id: string | null;
    token_hash: string;
    accepted_at: Date | null;
    expires_at: Date;
    invited_by_user_id: string | null;
    created_at: Date;
}
export interface InvitationPreviewRow {
    email: string;
    role_name: string;
    organization_name: string | null;
    inviter_name: string | null;
    accepted_at: Date | null;
    expires_at: Date;
}
export interface InvitationDiagnosisRow {
    accepted_at: Date | null;
    expires_at: Date;
}
export interface InsertPendingInput {
    email: string;
    roleId: string;
    organizationId: string | null;
    tokenHash: string;
    invitedByUserId: string;
}
export declare class InvitationsRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    insertPending(input: InsertPendingInput): Promise<InvitationRow>;
    findPreviewByHash(tokenHash: string): Promise<InvitationPreviewRow | null>;
    redeemCas(tokenHash: string, manager?: EntityManager): Promise<InvitationRow | null>;
    findDiagnosisByHash(tokenHash: string): Promise<InvitationDiagnosisRow | null>;
    findByClaimedEmail(email: string): Promise<{
        id: string;
    } | null>;
    deleteIfPending(id: string): Promise<boolean>;
    findPendingByOrganization(organizationId: string | null): Promise<InvitationRow[]>;
    private firstUpdatedRow;
}
