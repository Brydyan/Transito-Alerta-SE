import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * DTO for POST /api/menu-options — create a new menu option.
 * Validations enforced by service (F5.5.1):
 *   - duplicate route ⇒ 409
 *   - cycle in parent chain ⇒ 422
 *   - self-parent ⇒ 422
 */
export class CreateMenuOptionDto {
  @IsString()
  name!: string;

  @IsString()
  route!: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsInt()
  @Min(0)
  displayOrder!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
