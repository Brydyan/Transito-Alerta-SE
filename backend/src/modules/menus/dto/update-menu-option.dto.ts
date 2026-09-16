import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator';

/**
 * DTO for PATCH /api/menu-options/:id — update an existing menu option.
 * Partial: only provided fields are updated.
 * Validations enforced by service (F5.5.1):
 *   - duplicate route ⇒ 409
 *   - cycle in parent chain ⇒ 422
 *   - self-parent ⇒ 422
 */
export class UpdateMenuOptionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  icon?: string | null;

  @IsOptional()
  @ValidateIf((object, value) => value !== null)
  // Formato UUID genérico (cualquier versión) — ver F5.5.2 parentId validator.
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
