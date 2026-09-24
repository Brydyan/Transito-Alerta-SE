import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { IncidentStatus } from '../../../entities/incident.entity';

export class IncidentListQueryDto {
  @IsOptional()
  @IsUUID()
  zone_id?: string;

  @IsOptional()
  @IsIn(['pending', 'in_progress', 'resolved', 'closed'])
  status?: IncidentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
