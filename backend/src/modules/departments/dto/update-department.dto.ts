import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PATCH /api/departments/:id payload.
 *
 * `organization_id` is deliberately omitted — per design D4 the dept's
 * organization is immutable; a move would require a separate audited
 * flow that we don't ship yet. The DTO enforces this at the wire.
 */
export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
