import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateIncidentCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  /**
   * `undefined` = not provided (leave parent unchanged). `null` = explicit
   * request to promote this category to a root. class-validator's
   * `@IsOptional()` skips validation for both `undefined` and `null`.
   */
  @IsOptional()
  @IsUUID()
  parent_id?: string | null;
}
