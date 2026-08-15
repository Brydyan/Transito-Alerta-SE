import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../core/core.module';
import { GeofencingRepository, GeoZoneRow } from './geofencing.repository';

export const GEO_CACHE_TTL_SECONDS = 60;

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

/**
 * GeofencingService (design D4, CC5) — jurisdiction containment +
 * proximity, with a 60s Redis cache on point lookups (D4 cache-key grid,
 * ~110m precision via 3-decimal rounding).
 */
@Injectable()
export class GeofencingService {
  constructor(
    private readonly geofencingRepository: GeofencingRepository,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Resolves the containing zone for an incident's coordinates, WITHOUT
   * throwing when the point is outside all defined boundaries (R2 —
   * `geofence_matched=false` must still result in a 201, not a 4xx).
   * Coordinate range validation still throws (malformed input, not "outside
   * a zone").
   */
  async resolveZone(point: { lat: number; lng: number }): Promise<ResolvedZone> {
    const zone = await this.validateIncidentInZone(point);
    return { zone_id: zone?.id ?? null, zone };
  }

  /**
   * Resolves the zone containing an incident's coordinates at write time.
   * Per spec R2, an incident outside all defined boundaries MUST still be
   * accepted (geofence_matched=false) — callers decide that behavior;
   * this method only throws when the coordinates themselves are invalid.
   */
  async validateIncidentInZone(point: { lat: number; lng: number }): Promise<GeoZoneRow | null> {
    const { lat, lng } = point;
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw new BadRequestException('Invalid coordinates');
    }

    // Cached: containment is the hot path — every incident write resolves a
    // zone, and CC5 names this cache as the reason the geofencing layer
    // survives 25k users.
    return this.getCachedZoneByPoint(lat, lng);
  }

  /**
   * Cached point-containment lookup. Cache key rounds to 3 decimals
   * (~110m grid, design D4) to bound cardinality. TTL 60s.
   */
  async getCachedZoneByPoint(lat: number, lng: number): Promise<GeoZoneRow | null> {
    const key = this.buildCacheKey(lat, lng);
    const cached = await this.cache.get<GeoZoneRow | null>(key);
    if (cached !== undefined) {
      return cached;
    }

    const zone = await this.geofencingRepository.findZoneByPoint(lat, lng);
    // cache-manager-redis-yet's isCacheable() throws
    // `NoCacheableError: "null" is not a cacheable value` for cache.set(key,
    // null, ttl) — a point outside every zone (R2, which MUST still be
    // accepted) would 500 on write. It would not even work as a negative
    // cache if it succeeded: this store's own get() maps a stored null back
    // to `undefined`, indistinguishable from a miss. So a "not found" result
    // is simply not cached — every out-of-zone lookup re-queries PostGIS,
    // which is correct, just uncached.
    if (zone !== null) {
      await this.cache.set(key, zone, GEO_CACHE_TTL_SECONDS * 1000);
    }
    return zone;
  }

  private buildCacheKey(lat: number, lng: number): string {
    return `geo:point:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  }

  /**
   * Zone-scoped cache key: `geo:{zone_id}:{lat3}:{lng3}:{radius}:{status}`.
   * 3-decimal rounding (~110m grid) bounds cardinality (design D4).
   */
  buildZoneCacheKey(params: ZoneCacheKeyParams): string {
    const { zoneId, lat, lng, radiusKm, status } = params;
    return `geo:${zoneId}:${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusKm}:${status}`;
  }

  /** Registers `cacheKey` under the zone's tag-set for later purge. */
  async tagCacheKey(zoneId: string, cacheKey: string): Promise<void> {
    await this.redis.sadd(`geo:tags:${zoneId}`, cacheKey);
  }

  /**
   * Purges every cache key tagged under a zone (e.g. on incident.created /
   * incident.status_changed, per D4) plus the tag-set itself. No-op when
   * zoneId is null (an incident outside all zones has nothing to purge).
   */
  async purgeZoneCache(zoneId: string | null): Promise<void> {
    if (!zoneId) {
      return;
    }
    const tagKey = `geo:tags:${zoneId}`;
    const keys = await this.redis.smembers(tagKey);

    // The tagged VALUES live on the cache database (DB 1, via cache-manager)
    // while the tag-set itself lives on DB 0 with the raw client. Deleting
    // them with `redis.del()` would target DB 0 and silently remove nothing —
    // the purge would report success while every stale entry survived.
    await Promise.all(keys.map((key) => this.cache.del(key)));

    await this.redis.del(tagKey);
  }
}
