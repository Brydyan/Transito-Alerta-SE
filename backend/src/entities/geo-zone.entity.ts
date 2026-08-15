import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * geo_zones table (T1.5 — 0002_add_postgis_and_geo_zones.sql).
 *
 * `polygon` is stored as PostGIS geometry(POLYGON/MULTIPOLYGON, 4326) and is
 * queried via raw SQL in GeofencingRepository (ST_Contains/ST_DWithin) — see
 * design D4. This entity is used for typed reads of non-spatial columns;
 * spatial predicates always go through raw SQL.
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
