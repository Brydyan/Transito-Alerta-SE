import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * `departments` table — TypeORM entity row shape.
 * Mirrors `DepartmentEntity` (snake_case at the wire layer via the
 * global `SnakeCaseResponseInterceptor`); the raw SQL columns below
 * are intentionally snake_case.
 */
export interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
  organization_id: string;
  created_at: Date;
  updated_at: Date;
  /** T7.2 (0031) — soft delete tombstone. */
  deleted_at: Date | null;
}

/**
 * `front/2026-09-15-departments-menu` D2 — list rows are enriched with
 * the parent org's name (`organization_name`) and a live count of
 * non-deleted users in the dept (`user_count`). The joins keep the
 * query at one round-trip; without them the frontend would issue
 * `1 + N` round-trips for a list of N depts (one for each org, one per
 * dept for users).
 *
 * 0058 added a second enrichment: `category_ids` (the M:N list of
 * incident categories this dept handles), populated via a separate
 * `loadCategoryIdsByDeptIds` call after the main list query. The
 * matrix UI on `app/departamentos/new` renders one checkbox per
 * category; the list view shows the dept's full scope as badges.
 */
export interface EnrichedDepartmentRow extends DepartmentRow {
  organization_name: string;
  /** Users whose `department_id` matches AND `users.deleted_at IS NULL`. */
  user_count: number;
  /** M:N — incident categories handled by this dept (subset of all
   *  categories). `[]` when the dept is scope-less. */
  category_ids: string[];
}

/** Fields needed to INSERT a new dept. `id` is DB-generated. */
export interface CreateDepartmentInput {
  name: string;
  description: string | null;
  organizationId: string;
}

/**
 * Patch for UPDATE. `*Provided` flags mirror the convention used in
 * `OrganizationsRepository` / `GeoZonesRepository`: `null` is a
 * meaningful value (clearing `description`) that `COALESCE` cannot
 * distinguish from "absent". Only `name` and `description` are mutable;
 * `organization_id` is immutable per design D4.
 */
export interface UpdateDepartmentPatch {
  name: string | undefined;
  /** true if `description` was present in the request body (even if null) */
  descriptionProvided: boolean;
  description: string | null | undefined;
}

export interface ListDepartmentsFilters {
  organizationId: string;
  search?: string;
  /** default 1 */
  page?: number;
  /** default 50, max 100 */
  perPage?: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const SELECT_COLUMNS =
  'id, name, description, organization_id, created_at, updated_at, deleted_at';

/**
 * `list()` projection adds the two enriched columns (design D2). Kept
 * separate from `SELECT_COLUMNS` so non-list queries (findById,
 * findByIdActive) don't pay the join cost.
 */
const ENRICHED_SELECT_COLUMNS =
  'd.id, d.name, d.description, d.organization_id, d.created_at, d.updated_at, d.deleted_at, ' +
  'o.name AS organization_name, ' +
  'COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL) AS user_count';

/**
 * DepartmentsRepository (`back/2026-09-15-departments-module`) — raw SQL
 * via `dataSource.query()`, mirroring the project's dominant pattern
 * (`OrganizationsRepository`, `GeoZonesRepository`, `GeofencingRepository`).
 *
 * Every read filters `deleted_at IS NULL` (T7.2.B2); the soft-delete
 * tombstone is the only "deletion" mechanism — there's no `DELETE FROM
 * departments` anywhere in this file.
 *
 * Index usage (0056):
 *   - `idx_departments_org_deleted (organization_id, deleted_at)` is the
 *     covering index for the list query. Read this file in the order
 *     `(org, deleted, then everything else)` so the planner picks it.
 *
 * NOT here:
 *   - Incident orphaning on dept delete. That mutation crosses tables
 *     and belongs in `DepartmentsService.delete()` so the unit of
 *     "soft-deleting a dept" stays transactional in one place.
 */
@Injectable()
export class DepartmentsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(input: CreateDepartmentInput): Promise<DepartmentRow> {
    const rows: DepartmentRow[] = await this.dataSource.query(
      `INSERT INTO departments (id, name, description, organization_id)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING ${SELECT_COLUMNS}`,
      [input.name, input.description, input.organizationId],
    );
    return rows[0];
  }

  /** Soft delete via `deleted_at = now()`. Returns the deleted row's id + timestamp,
   * or null when no active row matched. Frontend uses the timestamp to render
   * "deleted at HH:MM" in a confirm toast (D8 of the menus change). */
  async softDelete(id: string): Promise<{ id: string; deleted_at: Date } | null> {
    const rows: Array<{ id: string; deleted_at: Date }> = await this.dataSource.query(
      `UPDATE departments SET deleted_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, deleted_at`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Hard-fetches a dept by id, including soft-deleted rows. Service is the gate. */
  async findById(id: string): Promise<DepartmentRow | null> {
    const rows: DepartmentRow[] = await this.dataSource.query(
      `SELECT ${SELECT_COLUMNS} FROM departments WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Soft-delete-aware variant for service-level guards. */
  async findByIdActive(id: string): Promise<DepartmentRow | null> {
    const rows: DepartmentRow[] = await this.dataSource.query(
      `SELECT ${SELECT_COLUMNS} FROM departments WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** True if a non-deleted dept with this (org, name) pair exists. */
  async existsByOrgAndName(organizationId: string, name: string): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await this.dataSource.query(
      `SELECT EXISTS (
         SELECT 1 FROM departments
          WHERE organization_id = $1
            AND name = $2
            AND deleted_at IS NULL
       ) AS exists`,
      [organizationId, name],
    );
    return rows[0]?.exists === true;
  }

  async list(
    filters: ListDepartmentsFilters,
  ): Promise<{ items: EnrichedDepartmentRow[]; total: number }> {
    const perPage = Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(filters.page ?? 1, 1);
    const offset = (page - 1) * perPage;

    // sc-323 sibling / 2026-09-15-departments-module verify-report C2:
    // when the controller skips the org filter for master (no
    // `query.organizationId` provided), `organizationId` arrives here as
    // an empty string. A UUID column cannot match `''`, so the previous
    // version returned 0 rows. Now: an empty/nullish `organizationId`
    // means "no filter" — master sees all non-deleted depts. The
    // controller already gates master-only; this is a defense-in-depth
    // for any other caller that bypasses the scope check.
    const hasOrgFilter =
      typeof filters.organizationId === 'string' && filters.organizationId.length > 0;

    // We always join `organizations` (for `organization_name`) and
    // `users` (for `user_count`). The WHERE on `departments` is the
    // only filter that matters for the page; the joined tables are
    // LEFT JOINed so a dept with zero users or with an org that has
    // been soft-deleted still appears.
    //
    // Important: the COUNT is a `FILTER (WHERE u.deleted_at IS NULL)`
    // aggregate inside the dept row, not a global COUNT. We do NOT
    // GROUP BY `u.id` (which would explode the row count) — Postgres
    // aggregates per `dept_id` partition thanks to the join key.
    const conditions: string[] = ['d.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (hasOrgFilter) {
      params.push(filters.organizationId);
      conditions.push(`d.organization_id = $${params.length}`);
    }

    if (filters.search && filters.search.trim().length > 0) {
      params.push(`%${filters.search.trim()}%`);
      conditions.push(`d.name ILIKE $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const itemsParams = [...params, perPage, offset];

    const items: EnrichedDepartmentRow[] = await this.dataSource.query(
      `SELECT ${ENRICHED_SELECT_COLUMNS}
         FROM departments d
         LEFT JOIN organizations o ON o.id = d.organization_id AND o.deleted_at IS NULL
         LEFT JOIN users u ON u.department_id = d.id
        ${whereClause}
        GROUP BY d.id, o.name
        ORDER BY d.name ASC
        LIMIT $${itemsParams.length - 1} OFFSET $${itemsParams.length}`,
      itemsParams,
    );

    const countRows: { count: string }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS count FROM departments ${whereClause.replace(/\bd\./g, '')}`,
      params,
    );

    // 0058: attach the M:N category assignment to every row in a single
    // follow-up query (no N+1). If `items` is empty the map is empty;
    // loadCategoryIdsByDeptIds short-circuits on an empty list.
    const categoryMap = await this.loadCategoryIdsByDeptIds(items.map((i) => i.id));
    for (const item of items) {
      item.category_ids = categoryMap.get(item.id) ?? [];
    }

    return { items, total: parseInt(countRows[0]?.count ?? '0', 10) };
  }

  /**
   * Resolve a user's dept via `users.department_id`. Partial index
   * `idx_users_department (department_id) WHERE deleted_at IS NULL`
   * covers the join.
   */
  async findByUser(userId: string): Promise<DepartmentRow | null> {
    const rows: DepartmentRow[] = await this.dataSource.query(
      `SELECT d.id, d.name, d.description, d.organization_id, d.created_at,
              d.updated_at, d.deleted_at
         FROM departments d
         JOIN users u ON u.department_id = d.id
        WHERE u.id = $1
          AND u.deleted_at IS NULL
          AND d.deleted_at IS NULL`,
      [userId],
    );
    return rows[0] ?? null;
  }

  /**
   * Orphan-pass for `DepartmentsService.delete()`. Sets `department_id = NULL`
   * on every incident that referenced the about-to-be-deleted dept, so
   * those rows fall back to the "org-wide" scope (design D3 + D2).
   *
   * NOTE (verify-report SG3): the WHERE clause intentionally does NOT
   * filter `incidents.deleted_at IS NULL`. Soft-deleted incidents also
   * lose their dept pointer. That's referentially correct (no incident
   * should reference a soft-deleted dept) and avoids resurrecting an
   * incident into the wrong scope if it is ever restored in the future.
   * If this becomes a UX problem (e.g. admins restoring incidents after
   * restoring their dept), revisit and split: skip the orphan pass for
   * soft-deleted incidents, or move the cleanup to a trigger.
   */
  async orphanIncidents(departmentId: string): Promise<number> {
    const result: [unknown, number] = await this.dataSource.query(
      `UPDATE incidents SET department_id = NULL WHERE department_id = $1`,
      [departmentId],
    );
    return result[1];
  }

  // ─────────────────────────────────────────────────────────────────
  // Incident-category join (M:N via `department_incident_categories`).
  // 0058 added this join table; the repo owns the read + write side.
  // ─────────────────────────────────────────────────────────────────

  /**
   * Replace the dept's incident-category assignment with `categoryIds`.
   * Used on `create()` and `update()` paths. The DB-level cascade on
   * dept delete + the composite PK make the "idempotent" semantics
   * trivial — we just delete-then-insert in a single round-trip.
   */
  async replaceCategoriesForDept(deptId: string, categoryIds: string[]): Promise<void> {
    // Always delete first (idempotent — if none exist, no-op).
    await this.dataSource.query(
      'DELETE FROM department_incident_categories WHERE department_id = $1',
      [deptId],
    );

    // Then insert the new set (if non-empty).
    if (categoryIds.length > 0) {
      await this.dataSource.query(
        `INSERT INTO department_incident_categories (department_id, incident_category_id)
         SELECT $1, UNNEST($2::uuid[])
         ON CONFLICT DO NOTHING`,
        [deptId, categoryIds],
      );
    }
  }

  /**
   * Bulk-load the category id list for the given depts in one query.
   * Used by `list()` to attach `category_ids` to every row without
   * an N+1. Result: Map<deptId, categoryId[]>.
   */
  async loadCategoryIdsByDeptIds(deptIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (deptIds.length === 0) {
      return map;
    }
    const rows: Array<{ department_id: string; incident_category_id: string }> =
      await this.dataSource.query(
        `SELECT department_id, incident_category_id
           FROM department_incident_categories
          WHERE department_id = ANY($1::uuid[])
          ORDER BY department_id, incident_category_id`,
        [deptIds],
      );
    for (const row of rows) {
      const list = map.get(row.department_id) ?? [];
      list.push(row.incident_category_id);
      map.set(row.department_id, list);
    }
    return map;
  }

  async update(id: string, patch: UpdateDepartmentPatch): Promise<DepartmentRow | null> {
    const rows: DepartmentRow[] = await this.dataSource.query(
      `UPDATE departments SET
         name        = COALESCE($2, name),
         description = CASE WHEN $3::boolean THEN $4::text ELSE description END
       WHERE id = $1
         AND deleted_at IS NULL
       RETURNING ${SELECT_COLUMNS}`,
      [id, patch.name, patch.descriptionProvided, patch.description],
    );
    return rows[0] ?? null;
  }
}
