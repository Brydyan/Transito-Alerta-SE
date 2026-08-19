import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ACTIVE_SESSION_SQL } from './session-validity';

/** The 12 raw, snake_case `user_sessions` columns (T3.9 design §4). */
export interface SessionRow {
  id: string;
  user_id: string;
  /** T3.6 (0017) — nullable: password logins accept an optional device_uuid as a session LABEL only (design D7). */
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

const SESSION_ROW_COLUMNS = `id, user_id, device_uuid, created_at, refresh_token_hash,
       previous_refresh_token_hash, rotated_at, ip_address, user_agent,
       revoked_at, last_used_at, expires_at`;

/**
 * SessionsRepository (T3.9 design §4) — raw SQL via `@InjectDataSource`
 * (house convention, precedent `StatusHistoryRepository`). There is NO
 * unfiltered finder: `findActiveById`/`findActiveByUser` are the only
 * methods returning a `SessionRow` for a live session, and both carry the
 * full `ACTIVE_SESSION_SQL` predicate. `existsRevoked` returns a boolean so
 * it can never be mistaken for a usable session.
 *
 * `AuthService`/`AuthModule` depend ONLY on this repository, never on
 * `SessionsService` (design §8) — `AuthModule` imports `SessionsModule` and
 * this class is the sole write path for `user_sessions` (spec "Ownership
 * of Writes").
 */
@Injectable()
export class SessionsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(input: CreateSessionInput): Promise<SessionRow> {
    const rows: SessionRow[] = await this.dataSource.query(
      `INSERT INTO user_sessions
         (id, user_id, device_uuid, refresh_token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7::int))
       RETURNING ${SESSION_ROW_COLUMNS}`,
      [
        input.id,
        input.userId,
        input.deviceUuid,
        input.refreshTokenHash,
        input.ipAddress,
        input.userAgent,
        input.ttlSeconds,
      ],
    );
    return rows[0];
  }

  async findActiveById(id: string): Promise<SessionRow | null> {
    const rows: SessionRow[] = await this.dataSource.query(
      `SELECT ${SESSION_ROW_COLUMNS}
         FROM user_sessions
        WHERE id = $1 AND ${ACTIVE_SESSION_SQL}`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findActiveByUser(userId: string): Promise<SessionRow[]> {
    return this.dataSource.query(
      `SELECT ${SESSION_ROW_COLUMNS}
         FROM user_sessions
        WHERE user_id = $1 AND ${ACTIVE_SESSION_SQL}
        ORDER BY created_at DESC`,
      [userId],
    );
  }

  /**
   * The design §1 rotation statement, verbatim — a compare-and-swap, NOT
   * split read-then-write. `null` return means the CAS lost (0 rows) —
   * that is NOT an error, it is the expected shape the loser of a
   * concurrent refresh race deterministically produces (design §1).
   */
  async rotate(input: RotateSessionInput): Promise<SessionRow | null> {
    const result = await this.dataSource.query(
      `UPDATE user_sessions
          SET previous_refresh_token_hash = refresh_token_hash,
              refresh_token_hash          = $2,
              rotated_at                  = now(),
              last_used_at                = now(),
              expires_at                  = now() + make_interval(secs => $3::int),
              ip_address                  = $4,
              user_agent                  = $5
        WHERE id                 = $1
          AND refresh_token_hash = $6
          AND revoked_at IS NULL
          AND expires_at > now()
      RETURNING ${SESSION_ROW_COLUMNS}`,
      [
        input.id,
        input.newHash,
        input.ttlSeconds,
        input.ipAddress,
        input.userAgent,
        input.expectedHash,
      ],
    );
    return this.firstUpdatedRow<SessionRow>(result);
  }

  /** Sets `revoked_at`; `RETURNING expires_at` gives the caller the TTL for the denylist entry. */
  async revoke(id: string): Promise<SessionRow | null> {
    const result = await this.dataSource.query(
      `UPDATE user_sessions
          SET revoked_at = now()
        WHERE id = $1 AND revoked_at IS NULL
      RETURNING ${SESSION_ROW_COLUMNS}`,
      [id],
    );
    return this.firstUpdatedRow<SessionRow>(result);
  }

  /**
   * TypeORM's `DataSource.query()` returns different shapes depending on
   * the SQL command: a flat `rows[]` for SELECT/INSERT, but a `[rows[],
   * affectedCount]` TUPLE for UPDATE/DELETE (`PostgresQueryRunner.query`'s
   * `case "DELETE": case "UPDATE":` branch). `rotate()`/`revoke()` are both
   * `UPDATE ... RETURNING`, so their raw result must be unwrapped as the
   * tuple — using it as a flat array (as if it were the former shape)
   * silently returns the wrapped `rows[]` array itself (always truthy,
   * even on 0 matched rows) instead of `undefined`/`null`, which would
   * make `rotate()`'s CAS-loss branch unreachable.
   */
  private firstUpdatedRow<T>(result: unknown): T | null {
    const [rows] = result as [T[], number];
    return rows[0] ?? null;
  }

  /**
   * Same tuple-unwrap as `firstUpdatedRow`, but returns the FULL array
   * instead of `rows[0]` (T3.6 tasks corrections table) — `firstUpdatedRow`
   * silently drops rows 2..N of a multi-row `UPDATE ... RETURNING`, which
   * `revokeAllForUser` below needs in full to compute a denylist TTL per
   * row.
   */
  private updatedRows<T>(result: unknown): T[] {
    const [rows] = result as [T[], number];
    return rows;
  }

  /**
   * T3.6 design D6 — bulk revoke every currently-active session for a user
   * in one statement. DB-only: this repository never touches Redis (T3.9
   * §8) — `AuthService.revokeAllForUser` does the `RevocationCache.revoke`
   * fan-out per row returned here.
   */
  async revokeAllForUser(userId: string): Promise<Array<{ id: string; expires_at: Date | null }>> {
    const result: unknown = await this.dataSource.query(
      `UPDATE user_sessions
          SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      RETURNING id, expires_at`,
      [userId],
    );
    return this.updatedRows<{ id: string; expires_at: Date | null }>(result);
  }

  /** Logging-only helper — returns a boolean, never a usable row. */
  async existsRevoked(id: string): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await this.dataSource.query(
      `SELECT EXISTS(SELECT 1 FROM user_sessions WHERE id = $1 AND revoked_at IS NOT NULL) AS exists`,
      [id],
    );
    return rows[0]?.exists ?? false;
  }

  /** Boot-warm query (design §2/§3.3) — uses `idx_user_sessions_revoked`. */
  async findRevokedUnexpired(): Promise<Array<{ id: string; expires_at: Date }>> {
    return this.dataSource.query(
      `SELECT id, expires_at
         FROM user_sessions
        WHERE revoked_at IS NOT NULL AND expires_at > now()`,
    );
  }

  /**
   * Raw `users LEFT JOIN roles` for the D9 authorization check (precedent
   * `RoomAuthorizer`) — keeps `SessionsModule` a leaf with zero import
   * edges into `UsersModule`/`RolesModule` (design §4/§8).
   */
  async findManageableTarget(userId: string): Promise<ManageableTarget | null> {
    const rows: Array<{ id: string; organization_id: string | null; role_name: string | null }> =
      await this.dataSource.query(
        `SELECT u.id, u.organization_id, r.name AS role_name
           FROM users u
           LEFT JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1`,
        [userId],
      );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return { id: row.id, organizationId: row.organization_id, roleName: row.role_name };
  }
}
