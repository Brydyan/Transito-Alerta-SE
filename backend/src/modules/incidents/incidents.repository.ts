import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { IncidentPriority, IncidentStatus } from '../../entities/incident.entity';
import { SubjectScope } from '../../common/authz/subject-scope';
import { scopeToSql } from '../../common/authz/scope-sql';

export interface IncidentRow {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  priority: IncidentPriority;
  citizen_id: string;
  assigned_to: string | null;
  zone_id: string | null;
  geofence_matched: boolean;
  organization_id: string | null;
  category_id: string | null;
  claimed_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
  lat: number;
  lng: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateIncidentInput {
  title: string;
  description: string | null;
  lat: number;
  lng: number;
  priority: IncidentPriority;
  citizenId: string;
  zoneId: string | null;
  geofenceMatched: boolean;
  organizationId: string | null;
}

const SELECT_COLUMNS = `
  id, title, description, status, priority,
  citizen_id, assigned_to, zone_id, geofence_matched, organization_id,
  category_id, claimed_by, approved_by, approved_at, rejected_by, rejected_at,
  rejection_reason,
  ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
  created_at, updated_at
`;

/**
 * IncidentsRepository (T2.1) — raw PostGIS SQL for the geometry column,
 * mirroring GeofencingRepository's isolation + parameterization convention
 * (design D4 / CC1 security hardening). ST_Point(x, y) = ST_Point(lng, lat).
 */
@Injectable()
export class IncidentsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(input: CreateIncidentInput): Promise<IncidentRow> {
    const rows: IncidentRow[] = await this.dataSource.query(
      `INSERT INTO incidents
         (title, description, location, status, priority, citizen_id, zone_id, geofence_matched, organization_id)
       VALUES
         ($1, $2, ST_SetSRID(ST_Point($3, $4), 4326), 'pending', $5, $6, $7, $8, $9)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.title,
        input.description,
        input.lng,
        input.lat,
        input.priority,
        input.citizenId,
        input.zoneId,
        input.geofenceMatched,
        input.organizationId,
      ],
    );
    return rows[0];
  }

  /**
   * `scope` is a REQUIRED parameter (T3.2 design D3) — never optional,
   * never defaulted. An unscoped call is a compile error, not a silent
   * `global` leak.
   */
  async findAll(
    filters: { zoneId?: string; status?: IncidentStatus },
    scope: SubjectScope,
  ): Promise<IncidentRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.zoneId) {
      params.push(filters.zoneId);
      conditions.push(`zone_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }

    const scopeSql = scopeToSql(scope, { table: 'incidents', paramOffset: params.length + 1 });
    conditions.push(scopeSql.fragment);
    params.push(...scopeSql.params);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.dataSource.query(
      `SELECT ${SELECT_COLUMNS} FROM incidents ${where} ORDER BY created_at DESC LIMIT 1000`,
      params,
    );
  }

  async findOne(id: string, scope: SubjectScope): Promise<IncidentRow | null> {
    const scopeSql = scopeToSql(scope, { table: 'incidents', paramOffset: 2 });
    const rows: IncidentRow[] = await this.dataSource.query(
      `SELECT ${SELECT_COLUMNS} FROM incidents WHERE id = $1 AND ${scopeSql.fragment}`,
      [id, ...scopeSql.params],
    );
    return rows[0] ?? null;
  }

  async updateStatus(id: string, status: IncidentStatus): Promise<IncidentRow | null> {
    const result = await this.dataSource.query(
      `UPDATE incidents SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [id, status],
    );
    return unwrapReturningRows<IncidentRow>(result)[0] ?? null;
  }

  /**
   * T5.6 — partial update of mutable content fields. Each field is
   * coalesced to its current value when null/undefined, so the caller
   * can send any subset. `status`, `zone_id`, `organization_id` and
   * `geofence_matched` are NEVER touched (D5).
   */
  async update(
    id: string,
    values: { title: string; description: string | null; categoryId: string | null },
  ): Promise<IncidentRow> {
    const result = await this.dataSource.query(
      `UPDATE incidents
         SET title = $2,
             description = $3,
             category_id = $4,
             updated_at = now()
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [id, values.title, values.description, values.categoryId],
    );
    const row = unwrapReturningRows<IncidentRow>(result)[0];
    if (!row) {
      throw new Error(`Incident ${id} vanished mid-update`);
    }
    return row;
  }
}

/**
 * Normalises the result of a `RETURNING` query across statement types.
 *
 * TypeORM's Postgres driver special-cases UPDATE and DELETE
 * (PostgresQueryRunner: `result.raw = [raw.rows, raw.rowCount]`) while INSERT
 * and SELECT return the rows directly. So `rows[0]` on an UPDATE yields the
 * whole row array, not the first row — which then spreads into a response
 * with no `id` or `zone_id`, silently breaking cache purging and realtime
 * event routing downstream.
 */
export function unwrapReturningRows<T>(result: unknown): T[] {
  if (!Array.isArray(result)) {
    return [];
  }
  // Tuple form: [rows, affectedCount]
  if (Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return result as T[];
}
