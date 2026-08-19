import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

/** The 9 raw, snake_case `invitations` columns (T3.6 design, 0018). */
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

const INVITATION_ROW_COLUMNS = `id, email, role_id, organization_id, token_hash,
       accepted_at, expires_at, invited_by_user_id, created_at`;

/**
 * InvitationsRepository (T3.6 design §2.5) — raw SQL via `@InjectDataSource`
 * (house convention, precedent `SessionsRepository`). `redeemCas` is a
 * compare-and-swap `UPDATE`, never read-then-write (design D3, same shape
 * as `SessionsRepository.rotate`) — accepts an optional `EntityManager` so
 * the caller can run it inside `dataSource.transaction(...)`.
 */
@Injectable()
export class InvitationsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async insertPending(input: InsertPendingInput): Promise<InvitationRow> {
    const rows: InvitationRow[] = await this.dataSource.query(
      `INSERT INTO invitations (email, role_id, organization_id, token_hash, invited_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${INVITATION_ROW_COLUMNS}`,
      [input.email, input.roleId, input.organizationId, input.tokenHash, input.invitedByUserId],
    );
    return rows[0];
  }

  /** No-auth preview lookup (spec `GET /invitations/preview`) — never consumes the token. */
  async findPreviewByHash(tokenHash: string): Promise<InvitationPreviewRow | null> {
    const rows: InvitationPreviewRow[] = await this.dataSource.query(
      `SELECT i.email, r.name AS role_name, o.name AS organization_name,
              (u.first_name || ' ' || u.last_name) AS inviter_name,
              i.accepted_at, i.expires_at
         FROM invitations i
         JOIN roles r ON r.id = i.role_id
         LEFT JOIN organizations o ON o.id = i.organization_id
         LEFT JOIN users u ON u.id = i.invited_by_user_id
        WHERE i.token_hash = $1`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  /**
   * D3 — CAS-first: `UPDATE ... WHERE token_hash=$1 AND accepted_at IS NULL
   * AND expires_at > now() RETURNING ...`. `null` return means the CAS lost
   * (0 rows, or no row at all) — the caller then calls
   * `findDiagnosisByHash` to decide 404 vs 410. Runs against `manager` when
   * supplied (inside `dataSource.transaction`), else the pool directly.
   */
  async redeemCas(tokenHash: string, manager?: EntityManager): Promise<InvitationRow | null> {
    const runner = manager ?? this.dataSource;
    const result: unknown = await runner.query(
      `UPDATE invitations
          SET accepted_at = now()
        WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()
      RETURNING ${INVITATION_ROW_COLUMNS}`,
      [tokenHash],
    );
    return this.firstUpdatedRow<InvitationRow>(result);
  }

  /** 404-vs-410 diagnosis when `redeemCas`/preview finds 0 live rows. `null` = unknown token (404). */
  async findDiagnosisByHash(tokenHash: string): Promise<InvitationDiagnosisRow | null> {
    const rows: InvitationDiagnosisRow[] = await this.dataSource.query(
      `SELECT accepted_at, expires_at FROM invitations WHERE token_hash = $1`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  /** 409 pre-check at invite creation and redemption (spec "Invitation Lifecycle"). */
  async findByClaimedEmail(email: string): Promise<{ id: string } | null> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM users WHERE email = $1`,
      [email],
    );
    return rows[0] ?? null;
  }

  /** `DELETE /invitations/:id` — only a still-pending (unaccepted) invitation may be revoked. */
  async deleteIfPending(id: string): Promise<boolean> {
    const result: unknown = await this.dataSource.query(
      `DELETE FROM invitations WHERE id = $1 AND accepted_at IS NULL RETURNING id`,
      [id],
    );
    return this.firstUpdatedRow<{ id: string }>(result) !== null;
  }

  async findPendingByOrganization(organizationId: string | null): Promise<InvitationRow[]> {
    if (organizationId === null) {
      return this.dataSource.query(
        `SELECT ${INVITATION_ROW_COLUMNS} FROM invitations
          WHERE accepted_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC`,
      );
    }
    return this.dataSource.query(
      `SELECT ${INVITATION_ROW_COLUMNS} FROM invitations
        WHERE accepted_at IS NULL AND expires_at > now() AND organization_id = $1
        ORDER BY created_at DESC`,
      [organizationId],
    );
  }

  /**
   * Same tuple-unwrap gotcha as `SessionsRepository.firstUpdatedRow` —
   * `UPDATE ... RETURNING`/`DELETE ... RETURNING` through
   * `DataSource.query()` returns a `[rows[], affectedCount]` tuple, not a
   * flat array.
   */
  private firstUpdatedRow<T>(result: unknown): T | null {
    const [rows] = result as [T[], number];
    return rows[0] ?? null;
  }
}
