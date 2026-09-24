import { GeoZoneLevel } from '../../../entities/geo-zone.entity';
export declare class ImportGeoZoneQueryDto {
    level: GeoZoneLevel;
    auto_parent?: boolean;
    name_column?: string;
    code_column?: string;
}
