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

  /**
   * F6 / 2026-09-08-f6-new-user-form (D1) — optional phone. The
   * `users.phone` column already exists since migration 0022
   * (`database/migrations/0022_t7_schema_completeness.sql`); this DTO was
   * the only thing preventing the F6 mock 03-02 form from
   * persisting it. Format is intentionally lax (no Ecuador prefix
   * enforcement on the backend) to mirror `UpdateProfileDto`
   * (T3.9) — the frontend applies `Validators.pattern` for
   * `+593…` / `09…` shapes.
   */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  organization_id?: string;

  /**
   * 2026-10-10-user-onboarding-telegram-tour (D1) — optional
   * `department_id`. The service validates the cross-row invariant
   * `dept.organization_id === dto.organization_id` for sectional
   * roles and forces `null` for global roles. Backend
   * (`UsersService.adminCreate`) is the source of truth for the
   * rules; the DTO stays open so the frontend can render the
   * selector for any role and let the service reject.
   */
  @IsOptional()
  @IsUUID()
  department_id?: string;

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
