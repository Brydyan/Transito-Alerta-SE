import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class FeedQueryDto {
  @IsOptional()
  @IsString()
  bbox?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(22)
  @Type(() => Number)
  zoom?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  /**
   * Filter by geographic zone (FK `incidents.zone_id` → `geo_zones.id`).
   *
   * T7.4 fix — was `location_id` until 2026-09-17; renamed to `zone_id`
   * to match the frontend `MapActiveFilters.zone_id` field (sc-334
   * Phase 4) and the actual FK column name. The previous `location_id`
   * name caused `forbidNonWhitelisted: true` 400s whenever the map
   * dropdown emitted its selected zone. The response shape
   * (`FeedItemDto.location_id`) is unchanged — it still describes the
   * same wire relationship, just from the consumer's perspective.
   */
  @IsOptional()
  @IsUUID()
  zone_id?: string;

  @IsOptional()
  @IsUUID()
  incident_category_id?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  per_page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;
}
