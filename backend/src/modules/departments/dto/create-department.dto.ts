import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  // sc-323 sibling / 2026-09-15-departments-module verify-report SG1:
  // DB column is TEXT (unbounded) but the catalog-style description should
  // fit a single screen of UI text without truncation. 500 chars is the
  // existing cap on the `permissions.action` and `permissions.resource`
  // columns — re-using it keeps validation surface uniform.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsUUID('4')
  organizationId!: string;

  /**
   * 0058 — incident categories handled by this dept. Optional: when
   * absent, the dept is created without any assignment (admins can
   * pick categories later via PATCH). Empty array `[]` is identical
   * to absent (no categories). 50 is a sanity cap (the category
   * catalog is O(10s); a 50-category dept would already be absurd).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  category_ids?: string[];
}
