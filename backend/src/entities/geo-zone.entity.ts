import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * The 4-level jurisdiction hierarchy (T3.8 design D3) — single source of
 * truth shared by the DTO's `@IsIn`, GeoZonesService's level-consistency
 * matrix, and migration 0013's `chk_geo_zones_level` CHECK constraint.
 */
export const GEO_ZONE_LEVELS = ['provincia', 'canton', 'parroquia', 'zona'] as const;
export type GeoZoneLevel = (typeof GEO_ZONE_LEVELS)[number];

/**
 * geo_zones table (T1.5 — 0002_add_postgis_and_geo_zones.sql; hierarchy
 * columns added by 0013 — T3.8).
 *
 * `polygon` is stored as PostGIS geometry(POLYGON/MULTIPOLYGON, 4326) and is
 * queried via raw SQL in GeofencingRepository (ST_Contains/ST_DWithin) and
 * GeoZonesRepository (ST_Multi/ST_GeomFromGeoJSON writes) — see design D2/D4.
 * This entity is used for typed reads of non-spatial columns; spatial
 * predicates always go through raw SQL. No self-relation decorator (design
 * D3) — `parentId` stays a flat column; this module does not read through
 * the entity (all-raw repository).
 */
@Entity('geo_zones')
export class GeoZoneEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326 })
  polygon!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'zona' })
  level!: GeoZoneLevel;

  /**
   * T7.6 (0035) — administrative code, for external import/export and
   * matching. `NULL` for zones without one; unique when present (partial
   * UNIQUE index — see migration 0035, R12.1).
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  code!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
