import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { OrganizationsRepository } from '../organizations/organizations.repository';
import {
  CreateDepartmentInput,
  DepartmentRow,
  DepartmentsRepository,
  EnrichedDepartmentRow,
  ListDepartmentsFilters,
  UpdateDepartmentPatch,
} from './departments.repository';

export interface ListResult {
  items: EnrichedDepartmentRow[];
  total: number;
}

/**
 * DepartmentsService (`back/2026-09-15-departments-module`).
 *
 * Layered authorization lives at the controller (design D6). This
 * service assumes the caller has the right permission and only:
 *   - enforces the org-existence precondition on create (the FK is
 *     NOT NULL on `departments.organization_id`, but we want a clear
 *     400 instead of a generic PG error 23502);
 *   - enforces UNIQUE(organization_id, name) on create (caller-visible
 *     before the INSERT, so we don't have to inspect PG error 23505);
 *   - propagates `NotFoundException` when reads hit soft-deleted rows;
 *   - orphans incidents before soft-deleting a dept (design D3 — see
 *     the comment in `delete()` below for the ordering rationale).
 *
 * Permission scope checks (master sees all; admin_org sees own org only)
 * are NOT here — they live in the controller's `users.organization_id`
 * comparison. Keeping the service thin is deliberate; mixing RBAC into
 * service methods turns every call into a permission audit and makes
 * the unit tests stateful in a way that doesn't add coverage.
 */
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly deptRepo: DepartmentsRepository,
    private readonly orgRepo: OrganizationsRepository,
  ) {}

  async create(input: CreateDepartmentInput): Promise<DepartmentRow> {
    const org = await this.orgRepo.findById(input.organizationId);
    if (!org) {
      throw new BadRequestException(
        `Organization ${input.organizationId} does not exist`,
      );
    }

    const collision = await this.deptRepo.existsByOrgAndName(input.organizationId, input.name);
    if (collision) {
      throw new ConflictException(
        `Department name '${input.name}' already exists in this organization (UNIQUE constraint)`,
      );
    }

    return this.deptRepo.create(input);
  }

  async findById(id: string): Promise<DepartmentRow> {
    const dept = await this.deptRepo.findByIdActive(id);
    if (!dept) {
      throw new NotFoundException(`Department ${id} not found or has been deleted`);
    }
    return dept;
  }

  async list(filters: ListDepartmentsFilters): Promise<ListResult> {
    return this.deptRepo.list(filters);
  }

  async update(id: string, patch: UpdateDepartmentPatch): Promise<DepartmentRow> {
    const updated = await this.deptRepo.update(id, patch);
    if (!updated) {
      throw new NotFoundException(`Department ${id} not found or has been deleted`);
    }
    return updated;
  }

  /**
   * Soft-delete a department AND orphan every incident that referenced
   * it. The two operations are NOT transactional here (no
   * `dataSource.transaction()` wrap) because:
   *   1. The orphan UPDATE is idempotent — running it twice is harmless.
   *   2. If the softDelete fails after the orphan ran, the dept is
   *      still alive and the incidents now have `department_id = NULL`,
   *      which is the "org-wide" scope — a legitimate state.
   *
   * Order: orphan FIRST, then softDelete. The reverse order would create
   * a brief window where `incidents.department_id` points at a
   * soft-deleted dept; reads that filter `deleted_at IS NULL` would
   * hide the dept from `findVisibleToUser` while the incident FK still
   * resolved. Orphaning first eliminates that inconsistency.
   */
  async delete(id: string): Promise<{ id: string; deleted_at: Date }> {
    // Existence check first so we can return 404 without touching incidents.
    // softDelete's `WHERE deleted_at IS NULL` already filters out deleted rows,
    // so a no-op return means the dept doesn't exist (or was already deleted).
    const existing = await this.deptRepo.findByIdActive(id);
    if (!existing) {
      throw new NotFoundException(`Department ${id} not found or already deleted`);
    }
    await this.deptRepo.orphanIncidents(id);

    const deleted = await this.deptRepo.softDelete(id);
    // Race: between findByIdActive above and softDelete here, another
    // request could have soft-deleted the same row. softDelete returns
    // null in that case; treat it as "already gone" → 404. Identical
    // error wording to findByIdActive so the client can't distinguish.
    if (!deleted) {
      throw new NotFoundException(`Department ${id} not found or already deleted`);
    }
    return deleted;
  }

  async findByUser(userId: string): Promise<DepartmentRow | null> {
    return this.deptRepo.findByUser(userId);
  }
}
