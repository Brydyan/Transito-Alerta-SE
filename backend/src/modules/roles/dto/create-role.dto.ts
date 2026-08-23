import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * T5.6 — body for `POST /api/roles`. Name is required; permissions default
 * to `[]` when omitted (the R6 minimum: a role that exists with no
 * permissions still resolves to `[]`, not 404).
 */
export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(64)
  permissions?: string[];
}
