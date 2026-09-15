import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
