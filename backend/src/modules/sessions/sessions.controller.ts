import { Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';

import { PermissionGuard } from '../../common/guards/permission.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionsService } from './sessions.service';

/**
 * SessionsController (T3.9 design §6/tasks 6.1) — `DELETE /sessions/:id`
 * only. No `@RequirePermission` decorator on this route (design §8's D9
 * self-bypass — `SessionsService.revokeForActor` does the conditional
 * self/cross-user branching itself); `PermissionGuard` stays in the guard
 * chain but no-ops with no metadata to read.
 *
 * A bulk `DELETE /sessions/:id/all` route is explicitly OUT OF SCOPE per
 * spec ("Bulk DELETE /api/users/:id/sessions (revoke-all-for-user)") — not
 * built here.
 */
@Controller('sessions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.sessionsService.revokeForActor(req.user!, id);
  }
}
