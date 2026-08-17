import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { GEO_ZONE_LEVELS, GeoZoneLevel } from '../../../entities/geo-zone.entity';
import { GeoJsonGeometry } from '../geo-zones.repository';
import { IsGeoJsonPolygon } from './is-geojson-polygon.validator';

export class CreateGeoZoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsGeoJsonPolygon()
  polygon!: GeoJsonGeometry;

  @IsOptional()
  @IsIn(GEO_ZONE_LEVELS)
  level?: GeoZoneLevel;

  @IsOptional()
  @IsUUID('4')
  parent_id?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
