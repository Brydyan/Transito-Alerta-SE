import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { StatusHistoryEntity } from './entities/status-history.entity';

export interface StatusHistoryEntryWithActor extends StatusHistoryEntity {
  /**
   * 2026-10-06-incident-images-read-path (D6) — actor name resolved
   * server-side via `LEFT JOIN users`. Snake_case on the wire
   * (`changed_by_name`) — the column alias is the SQL identifier so
   * the field carries through `SnakeCaseResponseInterceptor`
   * unchanged. `null` when `changed_by_user_id` is null OR the user
   * row was deleted (GDPR soft-delete); the frontend surfaces
   * `'sistema'` in that case (spec S5).
   */
  changed_by_name: string | null;
}

export interface InsertStatusHistoryData {
  incidentId: string;
  changedByUserId: string | null;
  previousStatus: string;
  newStatus: string;
  eventId: string;
}

/**
 * StatusHistoryRepository (design D7/D8) — append-only. Deliberately
 * exposes no `update`/`delete`/`remove`/`save` method: the only way to
 * add a row is `insert()`, and there is no way to change or remove one
 * through this class at all.
 *
 * `insert` is raw SQL (`@InjectDataSource().query()`), not the TypeORM
 * repository — `INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING id`
 * gives a reliable per-row conflict signal (`rows.length`) that TypeORM's
 * `orIgnore()` does not guarantee across drivers (D8). `findByIncident`
 * needs nothing SQL can't already express plainly, so it uses the
 * injected TypeORM repository.
 */
@Injectable()
export class StatusHistoryRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(StatusHistoryEntity)
    private readonly ormRepo: Repository<StatusHistoryEntity>,
  ) {}

  /**
   * Returns the inserted row (`[{ id }]`) on success, or `[]` when the
   * `event_id` unique constraint conflicts (already recorded) — the
   * caller (the listener's D3 decision table) branches on `rows.length`.
   */
  async insert(data: InsertStatusHistoryData): Promise<Array<{ id: string }>> {
    return this.dataSource.query(
      `INSERT INTO status_history
         (incident_id, changed_by_user_id, previous_status, new_status, event_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`,
      [data.incidentId, data.changedByUserId, data.previousStatus, data.newStatus, data.eventId],
    );
  }

  findByIncident(incidentId: string): Promise<StatusHistoryEntryWithActor[]> {
    // 2026-10-06-incident-images-read-path (D6) — `LEFT JOIN users`
    // avoids an N+1 (one HTTP round-trip per entry would be the
    // alternative). CONCAT handles `first_name`/`last_name` being
    // null individually; either null short-circuits to null,
    // matching the spec's 'sistema' fallback on the frontend.
    return this.dataSource.query(
      `SELECT
         status_history.id,
         status_history.incident_id,
         status_history.changed_by_user_id,
         status_history.previous_status,
         status_history.new_status,
         status_history.notes,
         status_history.event_id,
         status_history.created_at,
         CONCAT(u.first_name, ' ', u.last_name) AS changed_by_name
       FROM status_history
       LEFT JOIN users u ON u.id = status_history.changed_by_user_id
       WHERE status_history.incident_id = $1
       ORDER BY status_history.created_at ASC, status_history.id ASC`,
      [incidentId],
    );
  }
}
