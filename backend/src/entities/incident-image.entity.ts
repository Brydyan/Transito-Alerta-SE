import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * incident_images table (T6.6 — migration 0029).
 * Stores references to images uploaded against an incident.
 * `incident_id` FK references `incidents(id) ON DELETE CASCADE`.
 */
@Entity('incident_images')
export class IncidentImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId!: string;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ type: 'text' })
  url!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType!: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', update: false })
  updatedAt!: Date;
}
