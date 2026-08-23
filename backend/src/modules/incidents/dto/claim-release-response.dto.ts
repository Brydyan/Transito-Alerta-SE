import type { IncidentPriority, IncidentStatus } from '../../../entities/incident.entity';

/**
 * Slim response shape for the claim/release endpoints (design "Deviations
 * from Legacy"). The controller projects the raw SQL row into this DTO so
 * the API never leaks fields like `created_at`, `geofence_matched`, etc.
 */
export class ClaimReleaseResponseDto {
  id!: string;
  title!: string;
  status!: IncidentStatus;
  priority!: IncidentPriority;
  claimedBy!: string | null;
  organizationId!: string | null;
  updatedAt!: Date;
}
