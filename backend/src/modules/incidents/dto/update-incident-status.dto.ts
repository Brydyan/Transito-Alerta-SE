import { IsIn } from 'class-validator';

import { IncidentStatus } from '../../../entities/incident.entity';

export class UpdateIncidentStatusDto {
  @IsIn(['pending', 'in_progress', 'resolved'])
  status!: IncidentStatus;
}
