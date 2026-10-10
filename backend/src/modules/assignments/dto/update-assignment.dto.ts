import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/**
 * T6.4 — `PATCH /api/assignments/:id`.
 * Re-assigns to a new operator and/or changes the role.
 * At least one of `operator_id` or `role` must be present; validated in the service.
 *
 * F7 emergency-dispatch (design D3) — when `operator_id` changes, the
 * service re-runs the cap check; the same `override_cap` / `override_reason`
 * pair gates the exception. The DTO mirrors the shape of `AssignIncidentDto`
 * for the override fields so a re-assignment has the same audit semantics
 * as a fresh assign.
 */
export class UpdateAssignmentDto {
  @IsOptional()
  @IsUUID()
  operator_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(['primary', 'supervisor', 'observer'])
  role?: string;

  @IsOptional()
  @IsBoolean()
  override_cap?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  override_reason?: string;
}
