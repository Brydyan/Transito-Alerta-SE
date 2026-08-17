import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { StatusHistoryEntity } from '../../entities/status-history.entity';

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

  findByIncident(incidentId: string): Promise<StatusHistoryEntity[]> {
    return this.ormRepo.find({
      where: { incidentId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }
}
