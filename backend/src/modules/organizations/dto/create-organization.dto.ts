import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsUUID('4')
  zone_id?: string;

  /** T7.5.A4 — institutional parent (design D8). Cycle-checked in the service. */
  @IsOptional()
  @IsUUID('4')
  parent_id?: string;
}
