import { GeoZoneLevel } from '../../../entities/geo-zone.entity';
import { GeoJsonGeometry } from '../geo-zones.repository';
export declare class UpdateGeoZoneDto {
    name?: string;
    polygon?: GeoJsonGeometry;
    level?: GeoZoneLevel;
    parent_id?: string | null;
    active?: boolean;
    code?: string | null;
}
