import type { Cache } from 'cache-manager';
import type Redis from 'ioredis';
import { GeofencingRepository, GeoZoneRow } from './geofencing.repository';
export declare const GEO_CACHE_TTL_SECONDS = 60;
export declare const ALL_ZONES_TAG = "__all_zones__";
export declare const POINT_CACHE_TAG_KEY = "geo:tags:points";
export interface ZoneCacheKeyParams {
    zoneId: string;
    lat: number;
    lng: number;
    radiusKm: number;
    status: string;
}
export interface ResolvedZone {
    zone_id: string | null;
    zone: GeoZoneRow | null;
}
export declare class GeofencingService {
    private readonly geofencingRepository;
    private readonly cache;
    private readonly redis;
    constructor(geofencingRepository: GeofencingRepository, cache: Cache, redis: Redis);
    resolveZone(point: {
        lat: number;
        lng: number;
    }): Promise<ResolvedZone>;
    validateIncidentInZone(point: {
        lat: number;
        lng: number;
    }): Promise<GeoZoneRow | null>;
    getCachedZoneByPoint(lat: number, lng: number): Promise<GeoZoneRow | null>;
    private buildCacheKey;
    buildZoneCacheKey(params: ZoneCacheKeyParams): string;
    tagCacheKey(zoneId: string, cacheKey: string): Promise<void>;
    purgeZoneCache(zoneId: string | null): Promise<void>;
    tagPointCacheKey(cacheKey: string): Promise<void>;
    purgePointCache(): Promise<void>;
}
