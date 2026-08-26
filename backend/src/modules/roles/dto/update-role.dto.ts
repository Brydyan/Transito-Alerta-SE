import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * T5.6 — `PATCH /api/roles/:id`. Every field is optional; the service
 * does a partial update (only the fields present in the body are
 * touched). Manually written instead of `PartialType(CreateRoleDto)`
 * because `PartialType` does not surface the nested-array `permissions`
 * field on the resulting TS type (well-known class-validator mapped-types
 * quirk with `@IsArray`).
 */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(64)
  permissions?: string[];
}
