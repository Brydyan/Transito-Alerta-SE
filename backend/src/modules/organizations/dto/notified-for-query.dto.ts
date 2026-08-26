import { IsNumber, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * NotifiedForQueryDto (T6.1.B) — dual-input: GPS coordinates OR location_id.
 * At least one group must be provided; validated in the service, not here
 * (class-validator has no cross-field "at least one" decorator).
 *
 * `category_id` (T7.5.C3) now filters organizations by category ancestry —
 * `null`/absent still matches transversal orgs (`incident_category_id IS
 * NULL`), see `OrganizationsRepository.findNotifiedFor`.
 */
export class NotifiedForQueryDto {
  /** Grupo A: coordenadas GPS directas */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  /** Grupo B: IDs del cascading dropdown GeoReporta */
  @IsOptional()
  @IsUUID()
  location_id?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;
}
