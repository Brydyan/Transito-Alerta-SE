import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

/**
 * `PATCH /api/users/:id/organization` (T3.2 design D12). `organization_id:
 * null` is a valid, explicit request (removes the user from their org) —
 * `@ValidateIf` lets `null` through while still validating a non-null
 * value as a UUID.
 */
export class UpdateUserOrganizationDto {
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsUUID('4')
  organization_id!: string | null;
}
