import { DataSource, EntityManager } from 'typeorm';
export interface PasswordResetTokenRow {
    id: string;
    user_id: string;
    token_hash: string;
    used_at: Date | null;
    expires_at: Date;
    created_at: Date;
}
export interface PasswordResetDiagnosisRow {
    used_at: Date | null;
    expires_at: Date;
}
export declare class PasswordResetRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    insert(userId: string, tokenHash: string): Promise<PasswordResetTokenRow>;
    casConsume(tokenHash: string, manager?: EntityManager): Promise<PasswordResetTokenRow | null>;
    findDiagnosisByHash(tokenHash: string): Promise<PasswordResetDiagnosisRow | null>;
    private firstUpdatedRow;
}
