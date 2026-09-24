import { DataSource } from 'typeorm';
export interface SessionRow {
    id: string;
    user_id: string;
    device_uuid: string | null;
    created_at: Date;
    refresh_token_hash: string | null;
    previous_refresh_token_hash: string | null;
    rotated_at: Date | null;
    ip_address: string | null;
    user_agent: string | null;
    revoked_at: Date | null;
    last_used_at: Date | null;
    expires_at: Date | null;
}
export interface CreateSessionInput {
    id: string;
    userId: string;
    deviceUuid: string | null;
    refreshTokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
    ttlSeconds: number;
}
export interface RotateSessionInput {
    id: string;
    newHash: string;
    expectedHash: string;
    ttlSeconds: number;
    ipAddress: string | null;
    userAgent: string | null;
}
export interface ManageableTarget {
    id: string;
    organizationId: string | null;
    roleName: string | null;
}
export declare class SessionsRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    create(input: CreateSessionInput): Promise<SessionRow>;
    findActiveById(id: string): Promise<SessionRow | null>;
    findActiveByUser(userId: string): Promise<SessionRow[]>;
    rotate(input: RotateSessionInput): Promise<SessionRow | null>;
    revoke(id: string): Promise<SessionRow | null>;
    private firstUpdatedRow;
    private updatedRows;
    revokeAllForUser(userId: string): Promise<Array<{
        id: string;
        expires_at: Date | null;
    }>>;
    existsRevoked(id: string): Promise<boolean>;
    findRevokedUnexpired(): Promise<Array<{
        id: string;
        expires_at: Date;
    }>>;
    findManageableTarget(userId: string): Promise<ManageableTarget | null>;
}
