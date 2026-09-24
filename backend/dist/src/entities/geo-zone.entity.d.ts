export declare const GEO_ZONE_LEVELS: readonly ["provincia", "canton", "parroquia", "zona"];
export type GeoZoneLevel = (typeof GEO_ZONE_LEVELS)[number];
export declare class GeoZoneEntity {
    id: string;
    name: string;
    polygon: string;
    active: boolean;
    parentId: string | null;
    level: GeoZoneLevel;
    code: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
