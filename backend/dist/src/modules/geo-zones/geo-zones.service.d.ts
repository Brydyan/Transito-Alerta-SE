import { DataSource } from 'typeorm';
import { GeofencingService } from '../geofencing/geofencing.service';
import { GEO_ZONE_LEVELS, GeoZoneLevel } from '../../entities/geo-zone.entity';
import { CreateGeoZoneDto } from './dto/create-geo-zone.dto';
import { UpdateGeoZoneDto } from './dto/update-geo-zone.dto';
import { FormDataRow, GeoZoneDetailRow, GeoZoneNode, GeoZonesRepository, ListFilters } from './geo-zones.repository';
import { ImportGeoZoneQueryDto } from './dto/import-geo-zone-query.dto';
import { ImportGeoZoneResponse } from './dto/import-geo-zone-response.dto';
export interface ListResult {
    items: GeoZoneDetailRow[];
    total: number;
}
export declare class GeoZonesService {
    private readonly repo;
    private readonly geofencing;
    private readonly dataSource?;
    constructor(repo: GeoZonesRepository, geofencing: GeofencingService, dataSource?: DataSource | undefined);
    create(dto: CreateGeoZoneDto): Promise<GeoZoneDetailRow>;
    update(id: string, dto: UpdateGeoZoneDto): Promise<GeoZoneDetailRow>;
    delete(id: string): Promise<void>;
    findById(id: string): Promise<GeoZoneDetailRow>;
    list(filters?: ListFilters): Promise<ListResult>;
    getTree(): Promise<GeoZoneNode[]>;
    importShapefile(buffer: Buffer | ArrayBuffer, query: Partial<ImportGeoZoneQueryDto> & {
        level: GeoZoneLevel;
    }): Promise<ImportGeoZoneResponse>;
    getFormData(): Promise<{
        levels: readonly string[];
        parents: FormDataRow[];
    }>;
    private assertValidParent;
    private assertValidGeometry;
    private purgeGeoCaches;
}
export { GEO_ZONE_LEVELS };
