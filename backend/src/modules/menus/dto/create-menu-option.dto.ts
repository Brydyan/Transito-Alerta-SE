import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator';

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
  @ValidateIf((object, value) => value !== null)
  // Formato UUID genérico (cualquier versión). Postgres acepta versiones 0
  // como los IDs sembrados (a0000000-...); @IsUUID() solo valida v1-v5 y
  // rechazaba parentId de la lista del catálogo con 400.
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  parentId?: string | null;

  @IsInt()
  @Min(0)
  displayOrder!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
