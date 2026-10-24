import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PermissionGuard } from '../../shared/guards/permission.guard';
import { AuthenticatedRequest } from '../../shared/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssignmentEntity } from './entities/assignment.entity';
import { AssignIncidentDto } from './dto/assign-incident.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { AssignmentsService } from './assignments.service';

/**
 * AssignmentsController (R5). Assigning requires the ASSIGN permission —
 * PermissionGuard returns 403 for operators lacking "ASSIGN assignments"
 * (anonymous never holds this; it is not on the ceiling).
 *
 * F7 emergency-dispatch (design D12) — every WRITE method now receives
 * `req.user` so the service can validate the caller's scope against the
 * incident's and the operator's organization. Reads (`list`) were already
 * scoped (T3.2 D3); writes were the gap.
 */
@Controller('assignments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post()
  @RequirePermission('ASSIGN')
  async assign(
    @Body() dto: AssignIncidentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AssignmentEntity> {
    return this.assignmentsService.assign(
      dto.incident_id,
      dto.operator_id,
      dto.role,
      req.user!,
      {
        overrideCap: dto.override_cap,
        overrideReason: dto.override_reason,
      },
    );
  }

  @Delete(':id')
  @RequirePermission('ASSIGN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async release(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.assignmentsService.release(id, req.user!);
  }

  @Get('incident/:incidentId')
  @RequirePermission('READ')
  list(
    @Param('incidentId') incidentId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AssignmentEntity[]> {
    return this.assignmentsService.list(incidentId, req.user!.scope);
  }

  // ---- T5.6 PATCH /api/assignments/:id — re-assign to a new operator

  @Patch(':id')
  @RequirePermission('UPDATE')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AssignmentEntity> {
    return this.assignmentsService.update(
      id,
      { operator_id: dto.operator_id, role: dto.role },
      req.user!,
      {
        overrideCap: dto.override_cap,
        overrideReason: dto.override_reason,
      },
    );
  }
}
