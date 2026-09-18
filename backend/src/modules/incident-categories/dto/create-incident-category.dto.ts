import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateIncidentCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  /**
   * sc-334-adjacent (T7.4) — optional free-text description surfaced in
   * the admin form. Not exposed via /api/menus/my or /api/incidents.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;
}
