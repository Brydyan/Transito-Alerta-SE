import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatusHistoryListResult, StatusHistoryService } from './status-history.service';

/**
 * StatusHistoryController (design D1/D6) — one read route. The resource
 * override is explicit and MUST stay: without it, `inferResourceFromPath`
 * would infer `incidents` from this nested path and reopen the audit
 * trail to every citizen holding `READ incidents` (proposal D1).
 *
 * `req.user.scope` (T3.2 design D3, via the shared `AuthenticatedRequest`)
 * is forwarded to the service so the parent-existence check is org-scoped
 * — without it, any caller holding `READ status-history` could read any
 * other organization's status trail by UUID (post-verify security fix).
 */
@Controller('incidents/:incidentId/status-history')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class StatusHistoryController {
  constructor(private readonly statusHistoryService: StatusHistoryService) {}

  @Get()
  @RequirePermission('READ', 'status-history')
  list(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<StatusHistoryListResult> {
    return this.statusHistoryService.findByIncident(incidentId, req.user!.scope);
  }
}
