import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * T5.6 — body for `POST /api/notifications/:id/reject`. The 10-500
 * length range mirrors GeoReporta's `IncidentRejectRequest` — under 10
 * is too short to be useful, over 500 is hard to surface in a UI.
 */
export class RejectNotificationDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
