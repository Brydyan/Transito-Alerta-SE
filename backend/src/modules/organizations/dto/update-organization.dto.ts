import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  /**
   * `undefined` = not provided (leave zone unchanged). `null` = explicit
   * request to detach. class-validator's `@IsOptional()` skips validation
   * for both `undefined` and `null`.
   */
  @IsOptional()
  @IsUUID('4')
  zone_id?: string | null;

  /**
   * T7.5.B3 — same `undefined`/`null` convention as `zone_id`. Indirect
   * cycles (A→B→A) are rejected in `OrganizationsService.update`, not here.
   */
  @IsOptional()
  @IsUUID('4')
  parent_id?: string | null;
}
