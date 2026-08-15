import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssignmentEntity } from '../../entities/assignment.entity';
import { AssignIncidentDto } from './dto/assign-incident.dto';
import { AssignmentsService } from './assignments.service';

/**
 * AssignmentsController (R5). Assigning requires the ASSIGN permission —
 * PermissionGuard returns 403 for operators lacking "ASSIGN assignments"
 * (anonymous never holds this; it is not on the ceiling).
 */
@Controller('assignments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post()
  @RequirePermission('ASSIGN')
  assign(@Body() dto: AssignIncidentDto): Promise<AssignmentEntity> {
    return this.assignmentsService.assign(dto.incident_id, dto.operator_id, dto.role);
  }

  @Delete(':id')
  @RequirePermission('ASSIGN')
  @HttpCode(HttpStatus.NO_CONTENT)
  release(@Param('id') id: string): Promise<void> {
    return this.assignmentsService.release(id);
  }

  @Get('incident/:incidentId')
  @RequirePermission('READ')
  list(@Param('incidentId') incidentId: string): Promise<AssignmentEntity[]> {
    return this.assignmentsService.list(incidentId);
  }
}
