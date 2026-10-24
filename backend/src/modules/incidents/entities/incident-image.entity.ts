import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * incident_images table (T6.6 — migration 0029, schema delta for 0034).
 * Stores references to images uploaded against an incident.
 * `incident_id` FK references `incidents(id) ON DELETE CASCADE`.
 *
 * 2026-10-06-incident-images-read-path (D2) — the `url` column was
 * removed. The pre-change `IncidentImageStorageService` fabricated
 * a `https://storage.example.com/{key}?sig={hex}` URL against a
 * `storage_key` that was never actually uploaded; the column was an
 * unused duplicate of the storage location. The byte route
 * `GET /api/incidents/:id/images/:imageId/file` (D3/D4) is the only
 * resolution path, and the frontend renders via Blob Object URLs.
 */
@Entity('incident_images')
export class IncidentImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId!: string;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType!: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', update: false })
  updatedAt!: Date;
}
