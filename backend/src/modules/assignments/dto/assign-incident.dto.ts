import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class AssignIncidentDto {
  @IsUUID()
  incident_id!: string;

  @IsUUID()
  operator_id!: string;

  @IsOptional()
  @IsIn(['primary', 'secondary'])
  role?: string;

  /**
   * F7 emergency-dispatch (design D3) — explicit confirmation that the
   * admin accepts the cap-override. Without it the assignment is
   * rejected with 429 when the operator is at cap. With it, the
   * incident must be `critical` AND `override_reason` must be
   * non-empty; otherwise the service throws 422.
   */
  @IsOptional()
  @IsBoolean()
  override_cap?: boolean;

  /**
   * F7 emergency-dispatch (design D3) — free-text justification. The
   * service persists it on the assignment row and surfaces it to the
   * operator's Telegram message (D11). Required when `override_cap`
   * is true; the service enforces it, the validator gives an early
   * signal at the boundary.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  override_reason?: string;
}
