import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

/** The 6 raw, snake_case `password_reset_tokens` columns (T3.6 design, 0018). */
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

/**
 * PasswordResetRepository (T3.6 design) — raw SQL via `@InjectDataSource`,
 * same CAS shape as `InvitationsRepository.redeemCas` but on `used_at`
 * (design "Component Design" `PasswordResetService.confirm`). Lives in
 * `auth/` (not its own module) — its only consumer is
 * `PasswordResetService`.
 */
@Injectable()
export class PasswordResetRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async insert(userId: string, tokenHash: string): Promise<PasswordResetTokenRow> {
    const rows: PasswordResetTokenRow[] = await this.dataSource.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash)
       VALUES ($1, $2)
       RETURNING id, user_id, token_hash, used_at, expires_at, created_at`,
      [userId, tokenHash],
    );
    return rows[0];
  }

  /**
   * D3-shaped CAS: `UPDATE ... WHERE token_hash=$1 AND used_at IS NULL AND
   * expires_at > now() RETURNING ...`. `null` = CAS lost (0 rows, or no row
   * at all) — the caller then calls `findDiagnosisByHash` for 404 vs 410.
   */
  async casConsume(tokenHash: string, manager?: EntityManager): Promise<PasswordResetTokenRow | null> {
    const runner = manager ?? this.dataSource;
    const result: unknown = await runner.query(
      `UPDATE password_reset_tokens
          SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING id, user_id, token_hash, used_at, expires_at, created_at`,
      [tokenHash],
    );
    return this.firstUpdatedRow<PasswordResetTokenRow>(result);
  }

  async findDiagnosisByHash(tokenHash: string): Promise<PasswordResetDiagnosisRow | null> {
    const rows: PasswordResetDiagnosisRow[] = await this.dataSource.query(
      `SELECT used_at, expires_at FROM password_reset_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  private firstUpdatedRow<T>(result: unknown): T | null {
    const [rows] = result as [T[], number];
    return rows[0] ?? null;
  }
}
