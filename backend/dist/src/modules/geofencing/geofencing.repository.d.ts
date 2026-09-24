import { DataSource } from 'typeorm';
export interface GeoZoneRow {
    id: string;
    name: string;
    active: boolean;
    created_at: Date;
}
export declare class GeofencingRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    findZoneByPoint(lat: number, lng: number): Promise<GeoZoneRow | null>;
    findZonesNearby(lat: number, lng: number, radiusKm: number): Promise<GeoZoneRow[]>;
}
