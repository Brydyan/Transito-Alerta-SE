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

  /** Soft delete via `deleted_at = now()`. Returns whether a row was affected. */
  async softDelete(id: string): Promise<boolean> {
    const result: [Array<{ id: string }>, number] = await this.dataSource.query(
      `UPDATE departments SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return result[1] > 0;
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
  ): Promise<{ items: DepartmentRow[]; total: number }> {
    const perPage = Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(filters.page ?? 1, 1);
    const offset = (page - 1) * perPage;

    const conditions: string[] = ['deleted_at IS NULL', 'organization_id = $1'];
    const params: unknown[] = [filters.organizationId];

    if (filters.search && filters.search.trim().length > 0) {
      params.push(`%${filters.search.trim()}%`);
      conditions.push(`name ILIKE $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const itemsParams = [...params, perPage, offset];

    const items: DepartmentRow[] = await this.dataSource.query(
      `SELECT ${SELECT_COLUMNS} FROM departments
        ${whereClause}
        ORDER BY name ASC
        LIMIT $${itemsParams.length - 1} OFFSET $${itemsParams.length}`,
      itemsParams,
    );

    const countRows: { count: string }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS count FROM departments ${whereClause}`,
      params,
    );

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
   */
  async orphanIncidents(departmentId: string): Promise<number> {
    const result: [unknown, number] = await this.dataSource.query(
      `UPDATE incidents SET department_id = NULL WHERE department_id = $1`,
      [departmentId],
    );
    return result[1];
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
