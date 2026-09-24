import { Repository } from 'typeorm';
import { OrganizationEntity } from '../../entities/organization.entity';
import { GeoZoneEntity } from '../../entities/geo-zone.entity';
import { GeofencingService } from '../geofencing/geofencing.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ListFilters, OrganizationRow, OrganizationsRepository } from './organizations.repository';
import { NotifiedForQueryDto } from './dto/notified-for-query.dto';
export interface OrganizationWithClaimable extends OrganizationRow {
    is_claimable: boolean;
}
export interface ListResult {
    items: OrganizationRow[];
    total: number;
}
export interface OrganizationTreeNode {
    id: string;
    name: string;
    zoneId: string | null;
    children: OrganizationTreeNode[];
}
export interface OrganizationFormData {
    roles: Array<{
        id: string;
        name: string;
    }>;
    geoZones: Array<{
        id: string;
        name: string;
    }>;
}
export declare class OrganizationsService {
    private readonly repo;
    private readonly orgRepo;
    private readonly geoZoneRepo;
    private readonly geofencingService;
    constructor(repo: OrganizationsRepository, orgRepo: Repository<OrganizationEntity>, geoZoneRepo: Repository<GeoZoneEntity>, geofencingService: GeofencingService);
    create(dto: CreateOrganizationDto): Promise<OrganizationRow>;
    update(id: string, dto: UpdateOrganizationDto): Promise<OrganizationRow>;
    private assertNoCycle;
    assignCategory(id: string, incidentCategoryId: string | null): Promise<OrganizationRow>;
    delete(id: string): Promise<void>;
    findById(id: string): Promise<OrganizationRow>;
    list(filters?: ListFilters): Promise<ListResult>;
    findNotifiedFor(zoneId: string | null, categoryId: string | null): Promise<OrganizationRow[]>;
    tree(): Promise<OrganizationTreeNode[]>;
    formData(): Promise<OrganizationFormData>;
    notifiedFor(query: NotifiedForQueryDto): Promise<OrganizationWithClaimable[]>;
}
