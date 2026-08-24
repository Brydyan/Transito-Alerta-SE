import { IsNumber, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * NotifiedForQueryDto (T6.1.B) — dual-input: GPS coordinates OR location_id.
 * At least one group must be provided; validated in the service, not here
 * (class-validator has no cross-field "at least one" decorator).
 *
 * `category_id` is accepted for GeoReporta compatibility but is not yet
 * used to filter organizations — kept for future categorisation.
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
