import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * T5.6 — body for `POST /api/users` (admin create). Delegates the actual
 * onboarding to `InvitationsService.invite()` (D3 in the design), so
 * the DTO only captures the admin-supplied bits: email + the role to
 * grant on acceptance.
 */
export class AdminCreateUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  organization_id?: string;

  @IsOptional()
  @IsUUID()
  role_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  last_name?: string;
}
