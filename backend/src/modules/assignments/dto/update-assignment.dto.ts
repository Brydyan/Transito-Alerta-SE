import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * T6.4 — `PATCH /api/assignments/:id`.
 * Re-assigns to a new operator and/or changes the role.
 * At least one of `operator_id` or `role` must be present; validated in the service.
 */
export class UpdateAssignmentDto {
  @IsOptional()
  @IsUUID()
  operator_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(['primary', 'supervisor', 'observer'])
  role?: string;
}
