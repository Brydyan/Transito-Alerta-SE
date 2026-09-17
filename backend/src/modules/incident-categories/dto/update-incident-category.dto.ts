import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateIncidentCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  /**
   * sc-334-adjacent (T7.4) — optional free-text description. `undefined`
   * leaves it untouched, `null` clears it (admin "clear description").
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /**
   * `undefined` = not provided (leave parent unchanged). `null` = explicit
   * request to promote this category to a root. class-validator's
   * `@IsOptional()` skips validation for both `undefined` and `null`.
   */
  @IsOptional()
  @IsUUID()
  parent_id?: string | null;
}
