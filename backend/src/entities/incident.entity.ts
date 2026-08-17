import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type IncidentStatus = 'pending' | 'in_progress' | 'resolved';
export type IncidentPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * incidents table (T2.1 — 0004_incidents.sql).
 *
 * `location` is a PostGIS Point(SRID 4326) — NOT the MultiPolygon used by
 * geo_zones. `zone_id`/`geofence_matched` are resolved ONCE at write time
 * via GeofencingService.resolveZone (design D4); an incident outside all
 * zones still persists with zone_id=null, geofence_matched=false (spec R2).
 */
@Entity('incidents')
export class IncidentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  location!: string;

  @Column({ type: 'varchar', default: 'pending' })
  status!: IncidentStatus;

  @Column({ type: 'varchar', default: 'medium' })
  priority!: IncidentPriority;

  @Column({ name: 'citizen_id', type: 'uuid' })
  citizenId!: string;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo!: string | null;

  @Column({ name: 'zone_id', type: 'uuid', nullable: true })
  zoneId!: string | null;

  @Column({ name: 'geofence_matched', type: 'boolean', default: false })
  geofenceMatched!: boolean;

  /** T3.7 — schema-only column; no service/DTO wiring in this task. */
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId!: string | null;

  /**
   * T3.2 — derived from the resolved zone at write time (design D4), never
   * from the creator's own organization. NULL when outside every zone, or
   * the zone has no organization (migration 0015).
   */
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
