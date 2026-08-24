import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface OrganizationRow {
  id: string;
  name: string;
  zone_id: string | null;
  max_active_claims: number;
  created_at: Date;
}

export interface CreateOrganizationInput {
  name: string;
  zoneId: string | null;
}

export interface UpdateOrganizationPatch {
  name: string | undefined;
  /** true if `zone_id` was present in the request body (even if null) */
  zoneIdProvided: boolean;
  zoneId: string | null | undefined;
}

export interface ListFilters {
  search?: string;
  page?: number;
  perPage?: number;
}

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 100;

const SELECT_COLUMNS = 'id, name, zone_id, max_active_claims, created_at';

/**
 * OrganizationsRepository (T3.2 design D8) — mirrors GeoZonesRepository's
 * raw `dataSource.query()` convention. Fields: `id, name, zone_id,
 * created_at` only — no `parent_id`, category, claim limits, soft delete.
 */
@Injectable()
export class OrganizationsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(input: CreateOrganizationInput): Promise<OrganizationRow> {
    const rows: OrganizationRow[] = await this.dataSource.query(
      `INSERT INTO organizations (id, name, zone_id)
       VALUES (gen_random_uuid(), $1, $2)
       RETURNING ${SELECT_COLUMNS}`,
      [input.name, input.zoneId],
    );
    return rows[0];
  }

  async update(id: string, patch: UpdateOrganizationPatch): Promise<OrganizationRow | null> {
    const rows: OrganizationRow[] = await this.dataSource.query(
      `UPDATE organizations SET
         name    = COALESCE($2, name),
         zone_id = CASE WHEN $3::boolean THEN $4::uuid ELSE zone_id END
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [id, patch.name, patch.zoneIdProvided, patch.zoneId],
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.dataSource.query(`DELETE FROM organizations WHERE id = $1`, [id]);
    // TypeORM's PG driver returns rowCount for DELETE differently across
    // statement types (see IncidentsRepository.unwrapReturningRows) — a
    // plain DELETE with no RETURNING has no rows either way, so we check
    // the affected row count via a RETURNING id instead for determinism.
    return Array.isArray(result) ? true : (result?.rowCount ?? 0) > 0;
  }

  async findById(id: string): Promise<OrganizationRow | null> {
    const rows: OrganizationRow[] = await this.dataSource.query(
      `SELECT ${SELECT_COLUMNS} FROM organizations WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findAll(filters: ListFilters): Promise<{ items: OrganizationRow[]; total: number }> {
    const perPage = Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(filters.page ?? 1, 1);
    const offset = (page - 1) * perPage;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`name ILIKE $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const itemsParams = [...params, perPage, offset];
    const items: OrganizationRow[] = await this.dataSource.query(
      `SELECT ${SELECT_COLUMNS} FROM organizations
        ${whereClause}
        ORDER BY name ASC
        LIMIT $${itemsParams.length - 1} OFFSET $${itemsParams.length}`,
      itemsParams,
    );

    const countRows: { count: string }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS count FROM organizations ${whereClause}`,
      params,
    );

    return { items, total: parseInt(countRows[0]?.count ?? '0', 10) };
  }

  /**
   * Returns the single org owning `zoneId`, or `null`. Determinism is
   * guaranteed by the partial UNIQUE index `uq_organizations_zone`
   * (migration 0015) — not by this query.
   */
  async findByZone(zoneId: string): Promise<OrganizationRow | null> {
    const rows: OrganizationRow[] = await this.dataSource.query(
      `SELECT ${SELECT_COLUMNS} FROM organizations WHERE zone_id = $1`,
      [zoneId],
    );
    return rows[0] ?? null;
  }
}
