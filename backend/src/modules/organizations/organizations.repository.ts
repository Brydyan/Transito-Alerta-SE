import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface OrganizationRow {
  id: string;
  name: string;
  zone_id: string | null;
  max_active_claims: number;
  created_at: Date;
  /** T7.5 — institutional parent (design D8). */
  parent_id: string | null;
  /** T7.5 — routing category; NULL = transversal (design D7). */
  incident_category_id: string | null;
}

export interface CreateOrganizationInput {
  name: string;
  zoneId: string | null;
  parentId?: string | null;
}

export interface UpdateOrganizationPatch {
  name: string | undefined;
  /** true if `zone_id` was present in the request body (even if null) */
  zoneIdProvided: boolean;
  zoneId: string | null | undefined;
  /** true if `parent_id` was present in the request body (even if null) */
  parentIdProvided: boolean;
  parentId: string | null | undefined;
}

export interface ListFilters {
  search?: string;
  page?: number;
  perPage?: number;
}

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 100;

const SELECT_COLUMNS =
  'id, name, zone_id, max_active_claims, created_at, parent_id, incident_category_id';

/**
 * OrganizationsRepository (T3.2 design D8; T7.5 adds `parent_id` +
 * `incident_category_id`) — mirrors GeoZonesRepository's raw
 * `dataSource.query()` convention.
 */
@Injectable()
export class OrganizationsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(input: CreateOrganizationInput): Promise<OrganizationRow> {
    const rows: OrganizationRow[] = await this.dataSource.query(
      `INSERT INTO organizations (id, name, zone_id, parent_id)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING ${SELECT_COLUMNS}`,
      [input.name, input.zoneId, input.parentId ?? null],
    );
    return rows[0];
  }

  async update(id: string, patch: UpdateOrganizationPatch): Promise<OrganizationRow | null> {
    const rows: OrganizationRow[] = await this.dataSource.query(
      `UPDATE organizations SET
         name      = COALESCE($2, name),
         zone_id   = CASE WHEN $3::boolean THEN $4::uuid ELSE zone_id END,
         parent_id = CASE WHEN $5::boolean THEN $6::uuid ELSE parent_id END
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [id, patch.name, patch.zoneIdProvided, patch.zoneId, patch.parentIdProvided, patch.parentId],
    );
    return rows[0] ?? null;
  }

  /** T7.5.C6 — admin-only routing category assignment (design D7). */
  async updateCategory(id: string, incidentCategoryId: string | null): Promise<OrganizationRow | null> {
    const rows: OrganizationRow[] = await this.dataSource.query(
      `UPDATE organizations SET incident_category_id = $2
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [id, incidentCategoryId],
    );
    return rows[0] ?? null;
  }

  /**
   * T7.2.B2/C1 — soft delete (never a hard DELETE, R7.2). Idempotent: an
   * already-soft-deleted row still matches `WHERE id = $1` and re-stamps
   * `deleted_at`, so a repeat call returns `true` / 204 rather than 404.
   */
  async delete(id: string): Promise<boolean> {
    const result: unknown = await this.dataSource.query(
      `UPDATE organizations SET deleted_at = now() WHERE id = $1 RETURNING id`,
      [id],
    );
    const [rows] = result as [Array<{ id: string }>, number];
    return rows.length > 0;
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

    // T7.2.B2/R7.2 — soft-deleted orgs never appear in the list.
    const conditions: string[] = ['deleted_at IS NULL'];
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
   * T7.5.C2 — legacy `EloquentOrganizationRepository::findNotifiedFor()`
   * (design D7): two recursive CTEs resolve zone ancestry and category
   * ancestry, `incident_category_id IS NULL` means transversal (matches
   * any category), soft-deleted orgs are excluded, and the order is
   * `(created_at, id)` — stable and deterministic (our ids are uuid v4,
   * not sortable by insertion time the way legacy's autoincrement is).
   * `categoryId = null` still matches transversal orgs (empty `cat_chain`,
   * the `OR incident_category_id IS NULL` branch still applies).
   */
  async findNotifiedFor(zoneId: string, categoryId: string | null): Promise<OrganizationRow[]> {
    return this.dataSource.query(
      `WITH RECURSIVE zone_chain AS (
         SELECT id, parent_id FROM geo_zones WHERE id = $1
         UNION ALL
         SELECT z.id, z.parent_id FROM geo_zones z JOIN zone_chain c ON z.id = c.parent_id
       ), cat_chain AS (
         SELECT id, parent_id FROM incident_categories WHERE id = $2
         UNION ALL
         SELECT c.id, c.parent_id FROM incident_categories c JOIN cat_chain cc ON c.id = cc.parent_id
       )
       SELECT o.id, o.name, o.zone_id, o.max_active_claims, o.created_at,
              o.parent_id, o.incident_category_id
       FROM organizations o
       WHERE o.deleted_at IS NULL
         AND o.zone_id IN (SELECT id FROM zone_chain)
         AND (o.incident_category_id IN (SELECT id FROM cat_chain)
              OR o.incident_category_id IS NULL)
       ORDER BY o.created_at, o.id`,
      [zoneId, categoryId],
    );
  }
}
