import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class AssignIncidentDto {
  @IsUUID()
  incident_id!: string;

  @IsUUID()
  operator_id!: string;

  @IsOptional()
  @IsIn(['primary', 'secondary'])
  role?: string;
}
