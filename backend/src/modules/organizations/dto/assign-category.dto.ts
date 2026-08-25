import { IsOptional, IsUUID } from 'class-validator';

/**
 * T7.5.C6 — admin endpoint to (un)assign the routing category of an
 * organization. `null` clears it back to transversal (design D7).
 */
export class AssignCategoryDto {
  @IsOptional()
  @IsUUID('4')
  incident_category_id?: string | null;
}
