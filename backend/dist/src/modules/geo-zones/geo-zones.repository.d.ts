import { DataSource, QueryRunner } from 'typeorm';
import { GeoZoneLevel } from '../../entities/geo-zone.entity';
export declare const MAX_DEPTH = 1000;
export interface GeoJsonGeometry {
    type: string;
    coordinates: unknown;
    [key: string]: unknown;
}
export interface GeoZoneDetailRow {
    id: string;
    name: string;
    parent_id: string | null;
    parent_name?: string | null;
    level: GeoZoneLevel;
    active: boolean;
    polygon: GeoJsonGeometry;
    code: string | null;
    created_at: Date;
}
export interface GeoZoneTreeRow {
    id: string;
    name: string;
    parent_id: string | null;
    level: GeoZoneLevel;
    active: boolean;
    created_at: Date;
    code?: string | null;
    depth: number;
}
export interface GeoZoneNode extends Omit<GeoZoneTreeRow, 'depth'> {
    children: GeoZoneNode[];
}
export interface GeometryCheck {
    valid: boolean;
    reason: string | null;
    empty: boolean;
    geom_type: string;
    inBounds: boolean;
}
export interface ListFilters {
    search?: string;
    level?: GeoZoneLevel;
    parentId?: string | null;
    active?: boolean;
    includeInactive?: boolean;
    code?: string;
    page?: number;
    perPage?: number;
}
export interface CreateZoneInput {
    name: string;
    parentId: string | null;
    level: GeoZoneLevel;
    active: boolean;
    polygon: GeoJsonGeometry | null;
    code: string | null;
}
export interface FormDataRow {
    id: string;
    name: string;
    code: string | null;
    level: GeoZoneLevel;
}
export interface ParentCandidateRow {
    id: string;
    name: string;
    level: GeoZoneLevel;
}
export interface UpdateZonePatch {
    name: string | undefined;
    parentIdProvided: boolean;
    parentId: string | null | undefined;
    level: GeoZoneLevel | undefined;
    active: boolean | undefined;
    polygon: GeoJsonGeometry | undefined;
    codeProvided: boolean;
    code: string | null | undefined;
}
export declare class GeoZonesRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    validateGeometry(geoJson: unknown): Promise<GeometryCheck>;
    create(input: CreateZoneInput): Promise<GeoZoneDetailRow>;
    update(id: string, patch: UpdateZonePatch): Promise<GeoZoneDetailRow | null>;
    deactivate(id: string): Promise<{
        changed: boolean;
    } | null>;
    findById(id: string): Promise<GeoZoneDetailRow | null>;
    findAll(filters: ListFilters): Promise<{
        items: GeoZoneDetailRow[];
        total: number;
    }>;
    listFlat(rootId: string | null): Promise<GeoZoneTreeRow[]>;
    getSubtree(rootId: string | null): Promise<GeoZoneNode[]>;
    findParentLevel(parentId: string): Promise<GeoZoneLevel | null>;
    validateNoCycles(zoneId: string | null, proposedParentId: string | null): Promise<boolean>;
    createInTransaction(queryRunner: QueryRunner, input: CreateZoneInput): Promise<GeoZoneDetailRow>;
    findByCode(code: string): Promise<GeoZoneDetailRow | null>;
    findParentBySpatialContainment(geometry: unknown): Promise<ParentCandidateRow | null>;
    getFormData(): Promise<FormDataRow[]>;
}
export declare function buildZoneTree(rows: GeoZoneTreeRow[]): GeoZoneNode[];
