import { GeoZoneLevel } from '../../../entities/geo-zone.entity';
import { GeoJsonGeometry } from '../geo-zones.repository';
export declare class CreateGeoZoneDto {
    name: string;
    polygon?: GeoJsonGeometry;
    level?: GeoZoneLevel;
    parent_id?: string;
    active?: boolean;
    code?: string;
}
