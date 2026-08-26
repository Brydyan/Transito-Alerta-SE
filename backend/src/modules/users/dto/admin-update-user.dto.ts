import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * T5.6 — body for `PATCH /api/users/:id` (admin update). Every field is
 * optional; only present fields are touched.
 */
export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsUUID()
  role_id?: string;

  @IsOptional()
  @IsUUID()
  organization_id?: string;
}
