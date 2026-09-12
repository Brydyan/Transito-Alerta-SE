import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { AuditLogItemDto } from './dto/audit-log-item.dto';
import { AuditService } from './audit.service';

/**
 * AuditController (F6 — `2026-09-11-f6-audit-logs-export`)
 *
 * Read-side endpoints for `audit_events` (migration 0045,
 * sc-327). Both handlers require the `READ audit-logs`
 * permission granted by migration 0053 to the `master` role.
 *
 * Route order: literal routes (`/export.csv`) are declared
 * before any potential wildcard. Today the controller has
 * exactly two routes and no `:id` wildcard, so this is mostly
 * future-proofing; matches the same discipline
 * `IncidentsController` documents.
 */
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Paginated list with optional filters. Response shape is
   * `{ items, total }`. The global `SnakeCaseResponseInterceptor`
   * rewrites the camelCase DTO to snake_case on the wire
   * (`actorId` → `actor_id`, `createdAt` → `created_at`, …).
   */
  @Get()
  @RequirePermission('READ', 'audit-logs')
  list(
    @Query() filters: AuditLogFilterDto,
  ): Promise<{ items: AuditLogItemDto[]; total: number }> {
    return this.auditService.list(filters);
  }

  /**
   * CSV stream. Uses `@Res()` to bypass the global
   * `SnakeCaseResponseInterceptor` (the same exception
   * `IncidentsController.exportCsv` uses) so the body is
   * the raw CSV text — not JSON-encoded.
   *
   * The column order is fixed by spec R3-S1: `id, actor_id,
   * actor_name, action, resource_type, resource_id,
   * justification, created_at`. The `metadata` column is
   * intentionally omitted — the CSV is for human review, and
   * jsonb metadata is unreadable as a flat string.
   *
   * Cap: 10,000 rows enforced inside `AuditService.exportCsv`
   * (design D2 / spec R3-S3). The controller does not need to
   * know about the cap.
   */
  @Get('export.csv')
  @RequirePermission('READ', 'audit-logs')
  async exportCsv(
    @Query() filters: AuditLogFilterDto,
    @Res() res: Response,
  ): Promise<void> {
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    const stream = this.auditService.exportCsv(filters);
    stream.pipe(res);
  }
}
