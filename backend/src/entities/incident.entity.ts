import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type IncidentStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';
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

  /** T5.1 — operator who currently holds the claim. NULL = unclaimed. */
  @Column({ name: 'claimed_by', type: 'uuid', nullable: true })
  claimedBy!: string | null;

  /**
   * T5.6 — admin approve/reject decision columns (migration 0021).
   * `approved_*` and `rejected_*` are written as a pair (CHECK pair constraint)
   * and are mutually exclusive (XOR CHECK). `closed` status is the terminal
   * state set when `approved_by` is populated.
   */
  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejected_by', type: 'uuid', nullable: true })
  rejectedBy!: string | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
