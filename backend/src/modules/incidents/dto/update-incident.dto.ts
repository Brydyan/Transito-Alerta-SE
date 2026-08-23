import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * T5.6 — `PATCH /api/incidents/:id`. Only the mutable content fields
 * (title / description / category_id) are exposed — `status`, `zone_id`,
 * `organization_id` are deliberately absent (D5). `closed` (admin
 * terminal) is NOT settable here; it flows exclusively through the
 * approve path in `IncidentApprovalService`.
 */
export class UpdateIncidentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;
}
