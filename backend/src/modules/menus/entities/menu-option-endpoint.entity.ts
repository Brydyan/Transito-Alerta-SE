import { Entity, PrimaryColumn } from 'typeorm';

/**
 * menu_option_endpoints table (F5 — dynamic menus).
 *
 * Junction table linking menu options to their required API endpoints.
 * Composite PK, physical delete (D6) — same rationale as
 * menu_option_roles.
 */
@Entity('menu_option_endpoints')
export class MenuOptionEndpointEntity {
  @PrimaryColumn({ name: 'menu_option_id', type: 'uuid' })
  menuOptionId!: string;

  @PrimaryColumn({ name: 'endpoint_id', type: 'uuid' })
  endpointId!: string;
}
