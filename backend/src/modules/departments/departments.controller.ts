import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DepartmentRow } from './departments.repository';
import { DepartmentsService, ListResult } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { ListDepartmentsQuery } from './dto/list-departments.query';
import { UpdateDepartmentDto } from './dto/update-department.dto';

const GLOBAL_ROLES = new Set(['master', 'operador_sistema']);

/**
 * DepartmentsController (`back/2026-09-15-departments-module`).
 *
 * Layered authorization at the wire (design D6):
 *   - `@RequirePermission('...', 'departments')` gates each route via
 *     `PermissionGuard`. The catalog rows for `departments` (READ /
 *     CREATE / UPDATE / DELETE) come from migration `0057`.
 *   - Inside each handler, the controller adds the **org-scope check**:
 *     master + operador_sistema see everything; admin_org + below see
 *     only their own org. Concretely:
 *       - LIST: if the caller is not master/operador_sistema, override
 *         `query.organizationId` to the caller's own org.
 *       - CREATE: if the caller is not master/operador_sistema, the
 *         DTO's `organizationId` MUST equal the caller's org → 403
 *         otherwise.
 *       - READ / UPDATE / DELETE: load the dept first, then compare its
 *         `organization_id` to the caller's org → 403 otherwise.
 *
 * The 403-vs-404 question for cross-org reads: returning 404 would leak
 * the existence of a dept in another org. Returning 403 leaks the same
 * thing under a different verb. We chose 403 because the dept is not
 * deleted (only forbidden) — same as `assignments.controller.ts` does
 * for cross-org assignments.
 *
 * Route order: `@Get()` (list) before `@Get(':id')` (detail) is
 * irrelevant here because `ListDepartmentsQuery` and `ParseUUIDPipe` use
 * different decorators. `@Get(':id')` matches with `ParseUUIDPipe` so a
 * malformed id would 400, not 404. No literal path collision risk.
 */
@Controller('departments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @RequirePermission('READ', 'departments')
  async list(
    @Query() query: ListDepartmentsQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<ListResult> {
    const user = req.user!;
    const scopedOrgId =
      user.roleName && GLOBAL_ROLES.has(user.roleName)
        ? query.organization_id
        : user.organizationId;
    // The wire format is snake_case (`page`, `per_page`); the service
    // contract is camelCase. Manual parseInt for the page sizes with
    // clamping at the repo layer (1..100).
    const pageNum = query.page !== undefined ? parseInt(query.page, 10) : undefined;
    const perPageNum =
      query.per_page !== undefined ? parseInt(query.per_page, 10) : undefined;
    return this.departmentsService.list({
      organizationId: scopedOrgId ?? '',
      page: Number.isFinite(pageNum) ? pageNum : undefined,
      perPage: Number.isFinite(perPageNum) ? perPageNum : undefined,
      search: query.search,
    });
  }

  @Post()
  @RequirePermission('CREATE', 'departments')
  async create(
    @Body() dto: CreateDepartmentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DepartmentRow> {
    const user = req.user!;
    const isGlobal = user.roleName !== null && GLOBAL_ROLES.has(user.roleName);
    if (!isGlobal) {
      if (!user.organizationId) {
        throw new ForbiddenException('Caller has no organization scope');
      }
      if (dto.organizationId !== user.organizationId) {
        throw new ForbiddenException('Cannot create a department in another organization');
      }
    }
    return this.departmentsService.createWithCategories(
      {
        name: dto.name,
        description: dto.description ?? null,
        organizationId: dto.organizationId,
      },
      dto.category_ids ?? [],
    );
  }

  /**
   * 0058 — `GET /api/departments/form-data`. Returns the lookup data
   * the form needs (currently just the active incident categories list).
   * Kept as a sibling of `/form-data` for other catalog forms
   * (organizations, geo-zones) — when those grow, extract a shared
   * helper.
   */
  @Get('form-data')
  @RequirePermission('READ', 'departments')
  async formData(): Promise<{
    incident_categories: Array<{ id: string; name: string; parent_id: string | null }>;
  }> {
    const rows = await this.departmentsService.listIncidentCategoriesForForm();
    return { incident_categories: rows };
  }

  @Get(':id')
  @RequirePermission('READ', 'departments')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ department: DepartmentRow; category_ids: string[] }> {
    const dept = await this.departmentsService.findById(id);
    this.assertSameOrg(dept.organization_id, req);
    return this.departmentsService.findByIdWithCategories(id);
  }

  @Patch(':id')
  @RequirePermission('UPDATE', 'departments')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDepartmentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DepartmentRow> {
    // Pre-load to enforce org scope BEFORE the patch; service-level
    // 404 covers the deleted/missing case.
    const existing = await this.departmentsService.findById(id);
    this.assertSameOrg(existing.organization_id, req);
    return this.departmentsService.updateWithCategories(
      id,
      {
        name: dto.name,
        descriptionProvided: dto.description !== undefined,
        description: dto.description,
      },
      dto.category_ids ?? null,
    );
  }

  @Delete(':id')
  @RequirePermission('DELETE', 'departments')
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ id: string; deleted_at: Date }> {
    const existing = await this.departmentsService.findById(id);
    this.assertSameOrg(existing.organization_id, req);
    return this.departmentsService.delete(id);
  }

  /**
   * Single-source org-scope check. `master` and `operador_sistema`
   * bypass it; everyone else must match exactly. Missing
   * `organizationId` on either side throws 403 — we don't silently
   * fall back to "no filter", which would let a misconfigured caller
   * see across the project.
   */
  private assertSameOrg(deptOrgId: string, req: AuthenticatedRequest): void {
    const user = req.user!;
    if (user.roleName !== null && GLOBAL_ROLES.has(user.roleName)) {
      return;
    }
    if (!user.organizationId || user.organizationId !== deptOrgId) {
      throw new ForbiddenException('Department belongs to another organization');
    }
  }
}
