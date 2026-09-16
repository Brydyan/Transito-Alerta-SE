import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PATCH /api/departments/:id payload.
 *
 * `organization_id` is deliberately omitted — per design D4 the dept's
 * organization is immutable; a move would require a separate audited
 * flow that we don't ship yet. The DTO enforces this at the wire.
 *
 * Soft-delete reversal (spec S8.2) is OUT OF SCOPE for this change
 * (verify-report W2): admins currently can't undelete a soft-deleted
 * dept via the PATCH endpoint. Future change will add a dedicated
 * `restore` flag or a separate POST /:id/restore route.
 */
export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  // verify-report SG1: mirror the cap from `CreateDepartmentDto`.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
