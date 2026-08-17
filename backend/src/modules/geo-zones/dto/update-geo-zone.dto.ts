import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { GEO_ZONE_LEVELS, GeoZoneLevel } from '../../../entities/geo-zone.entity';
import { GeoJsonGeometry } from '../geo-zones.repository';
import { IsGeoJsonPolygon } from './is-geojson-polygon.validator';

export class UpdateGeoZoneDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsGeoJsonPolygon()
  polygon?: GeoJsonGeometry;

  @IsOptional()
  @IsIn(GEO_ZONE_LEVELS)
  level?: GeoZoneLevel;

  /**
   * `undefined` = not provided (leave parent unchanged). `null` = explicit
   * request to detach to root. class-validator's `@IsOptional()` skips
   * validation for both `undefined` and `null`.
   */
  @IsOptional()
  @IsUUID('4')
  parent_id?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
