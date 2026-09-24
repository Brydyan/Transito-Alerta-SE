import { GeoZoneLevel } from '../../entities/geo-zone.entity';
import { CreateGeoZoneDto } from './dto/create-geo-zone.dto';
import { ImportGeoZoneQueryDto } from './dto/import-geo-zone-query.dto';
import { ImportGeoZoneResponse } from './dto/import-geo-zone-response.dto';
import { UpdateGeoZoneDto } from './dto/update-geo-zone.dto';
import { FormDataRow, GeoZoneDetailRow, GeoZoneNode } from './geo-zones.repository';
import { GeoZonesService, ListResult } from './geo-zones.service';
export declare class GeoZonesController {
    private readonly geoZonesService;
    constructor(geoZonesService: GeoZonesService);
    getTree(): Promise<GeoZoneNode[]>;
    importShapefile(file: Express.Multer.File | undefined, query: ImportGeoZoneQueryDto): Promise<ImportGeoZoneResponse>;
    getFormData(): Promise<{
        levels: readonly string[];
        parents: FormDataRow[];
    }>;
    list(search?: string, parentId?: string, level?: GeoZoneLevel, includeInactive?: string, code?: string, page?: string, perPage?: string): Promise<ListResult>;
    findOne(id: string): Promise<GeoZoneDetailRow>;
    create(dto: CreateGeoZoneDto): Promise<GeoZoneDetailRow>;
    update(id: string, dto: UpdateGeoZoneDto): Promise<GeoZoneDetailRow>;
    remove(id: string): Promise<void>;
}
