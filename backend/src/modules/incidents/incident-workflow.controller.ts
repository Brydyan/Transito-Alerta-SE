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
 * T5.1 — operator claim/release + available-operators + status catalog.
 * Route ordering matters: `statuses` MUST appear before `:id` so the literal
 * segment is not captured as a UUID param. (T5.1 task 5.3 / design D5.)
 */
@Controller('incidents')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IncidentWorkflowController {
  constructor(private readonly workflow: IncidentWorkflowService) {}

  @Get('statuses')
  // No @RequirePermission — any authenticated user can read the catalog.
  getStatuses(): { statuses: string[] } {
    return { statuses: this.workflow.getStatuses() };
  }

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
