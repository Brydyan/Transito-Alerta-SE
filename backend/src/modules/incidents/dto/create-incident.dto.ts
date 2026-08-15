import { IsIn, IsLatitude, IsLongitude, IsOptional, IsString, MinLength } from 'class-validator';

import { IncidentPriority } from '../../../entities/incident.entity';

export class CreateIncidentDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: IncidentPriority;
}
