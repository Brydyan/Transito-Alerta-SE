import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { scopeToSql } from '../../common/authz/scope-sql';
import { SubjectScope } from '../../common/authz/subject-scope';
import { StatusHistoryEntity } from '../../entities/status-history.entity';
import { StatusHistoryRepository } from './status-history.repository';

export interface StatusHistoryListResult {
  items: StatusHistoryEntity[];
  total: number;
}

/**
 * StatusHistoryService (design D8) — read path only. Runs a scoped
 * existence check against `incidents` first (the module's sanctioned
 * import — D8/D7) so an unknown OR out-of-scope incident 404s before the
 * guard even runs (route-level ordering is documented separately: the
 * permission guard runs before this handler, so an unauthorised caller
 * still gets 403 for a non-existent incident).
 *
 * The existence check is scoped via `scopeToSql` (T3.2 design D3),
 * mirroring `IncidentsRepository.findOne` — an org-scoped caller must get
 * 404, never 403, for another org's incident (T3.2 D11): a 403 would
 * confirm the incident exists and, by elimination, leak that it belongs
 * to another organization. `scope` is REQUIRED, never optional or
 * defaulted — an unscoped call is a compile error, not a silent `global`
 * leak.
 *
 * No `{data}` envelope, no pagination (proposal D6, AS-5) — `total` is
 * simply `items.length`.
 */
@Injectable()
export class StatusHistoryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly statusHistoryRepository: StatusHistoryRepository,
  ) {}

  async findByIncident(
    incidentId: string,
    scope: SubjectScope,
  ): Promise<StatusHistoryListResult> {
    const scopeSql = scopeToSql(scope, { table: 'incidents', paramOffset: 2 });
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM incidents WHERE id = $1 AND (${scopeSql.fragment}) LIMIT 1`,
      [incidentId, ...scopeSql.params],
    );
    if (rows.length === 0) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }

    const items = await this.statusHistoryRepository.findByIncident(incidentId);
    return { items, total: items.length };
  }
}
