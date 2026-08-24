import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AvailableOperatorDto } from './dto/available-operator.dto';
import { ClaimReleaseResponseDto } from './dto/claim-release-response.dto';
import { IncidentWorkflowService } from './incident-workflow.service';

/**
 * T5.1 — operator claim/release + available-operators.
 * T6.8.A4: the `statuses` route was moved to IncidentsController.getStatuses()
 * so it can return the richer `[{ id, label }]` catalog format. The old
 * `{ statuses: string[] }` wrapper is removed here to avoid the two
 * @Get('statuses') registrations under the same @Controller('incidents')
 * base path from colliding (last-registered wins, which was the old one).
 */
@Controller('incidents')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IncidentWorkflowController {
  constructor(private readonly workflow: IncidentWorkflowService) {}

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('CLAIM', 'incidents')
  claim(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ClaimReleaseResponseDto> {
    return this.workflow.claim(id, this.toOperator(req));
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('RELEASE', 'incidents')
  release(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ClaimReleaseResponseDto> {
    return this.workflow.release(id, this.toOperator(req));
  }

  @Get(':id/available-operators')
  @RequirePermission('READ', 'incidents')
  availableOperators(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AvailableOperatorDto[]> {
    return this.workflow.availableOperators(id);
  }

  // Map the AuthenticatedRequest user (AuthContext) to the minimal shape the
  // service expects. Stays in the controller so the service has no Nest
  // request coupling.
  private toOperator(req: AuthenticatedRequest) {
    const user = req.user;
    if (!user) {
      // JwtAuthGuard runs first, so reaching here without a user is a bug.
      throw new Error('AuthenticatedRequest reached controller without user');
    }
    return {
      id: user.userId,
      organizationId: user.organizationId ?? null,
      role: user.roleName ?? null,
    };
  }
}
