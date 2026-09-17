import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * api_endpoints table (F5 — dynamic menus).
 *
 * Catalog of assignable API endpoints (D5). Seeded by migration with the
 * application's current routes. A divergence test (D5) compares these
 * rows against registered routes at test time.
 */
@Entity('api_endpoints')
@Unique(['method', 'path'])
export class ApiEndpointEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  method!: string;

  @Column({ type: 'varchar' })
  path!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
