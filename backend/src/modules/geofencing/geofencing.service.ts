import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { GeofencingRepository, GeoZoneRow } from './geofencing.repository';

export const GEO_CACHE_TTL_SECONDS = 60;

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
  ) {}

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

    return this.geofencingRepository.findZoneByPoint(lat, lng);
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
    await this.cache.set(key, zone, GEO_CACHE_TTL_SECONDS * 1000);
    return zone;
  }

  private buildCacheKey(lat: number, lng: number): string {
    return `geo:point:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  }
}
