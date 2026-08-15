import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface GeoZoneRow {
  id: string;
  name: string;
  active: boolean;
  created_at: Date;
}

/**
 * GeofencingRepository (design D4) — raw PostGIS SQL, isolated so the
 * spatial engine can be swapped without touching GeofencingService.
 *
 * IMPORTANT — ST_Point argument order is (lng, lat), NOT (lat, lng). Mixing
 * this up is the classic PostGIS bug: swapping them silently produces a
 * point on the wrong side of the planet instead of an error. See the
 * regression test in geofencing.repository.spec.ts.
 *
 * All queries are parameterized ($1, $2, ...) — never string-interpolated —
 * per CC1/security hardening (T4.3).
 */
@Injectable()
export class GeofencingRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Jurisdiction containment (D4): resolves the zone whose polygon contains
   * the given point, ONCE, at incident-write time.
   */
  async findZoneByPoint(lat: number, lng: number): Promise<GeoZoneRow | null> {
    const rows: GeoZoneRow[] = await this.dataSource.query(
      `SELECT id, name, active, created_at
       FROM geo_zones
       WHERE active = true
         AND ST_Contains(polygon, ST_SetSRID(ST_Point($1, $2), 4326))
       LIMIT 1`,
      [lng, lat],
    );
    return rows[0] ?? null;
  }

  /**
   * Proximity feed (D4): zones within `radiusKm` of the given point,
   * resolved at read time via ST_DWithin on the geography cast.
   */
  async findZonesNearby(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<GeoZoneRow[]> {
    const radiusMeters = radiusKm * 1000;
    return this.dataSource.query(
      `SELECT id, name, active, created_at
       FROM geo_zones
       WHERE active = true
         AND ST_DWithin(
           polygon::geography,
           ST_SetSRID(ST_Point($1, $2), 4326)::geography,
           $3
         )`,
      [lng, lat, radiusMeters],
    );
  }
}
