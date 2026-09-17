import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

import { GEO_ZONE_LEVELS, GeoZoneLevel } from '../../../entities/geo-zone.entity';

/**
 * Query-string DTO for POST /geo-zones/import (design D5).
 * Metadata arrives as query params (file as multipart field).
 * Default: name_column='NAME', code_column='CODE', auto_parent=true.
 */
export class ImportGeoZoneQueryDto {
  @IsIn(GEO_ZONE_LEVELS)
  level!: GeoZoneLevel;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  auto_parent?: boolean;

  @IsOptional()
  @IsString()
  name_column?: string;

  @IsOptional()
  @IsString()
  code_column?: string;
}
