import { CardField } from '../data-card/data-card.component';

/**
 * Predefined card field configurations for each of the 5 tables (D3, S2.2).
 *
 * Each config defines exactly 3 fields that DataCardComponent renders
 * when the viewport is below the lg breakpoint (1024px).
 */

/**
 * S9.1 — Incidents: title | status badge | priority badge.
 * Wire model: Incident { title, status, priority }.
 */
export const INCIDENTS_CARD_FIELDS: readonly CardField[] = [
  { key: 'title', label: 'Titulo' },
  { key: 'status', label: 'Estado', format: 'badge' },
  { key: 'priority', label: 'Prioridad', format: 'priority-badge' },
];

/**
 * S9.2 — Users: nombre | email | rol.
 * Wire model: User { nombres, email, rol?.nombre }.
 * Uses a derived `nombre` field (full name) set by the list component.
 */
export const USERS_CARD_FIELDS: readonly CardField[] = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'email', label: 'Email' },
  { key: 'rol', label: 'Rol' },
];

/**
 * S9.3 — Roles: nombre | permisos count | usuarios count.
 * Wire model: RoleListItem { nombre, permissionCount }.
 * `usuariosCount` is a derived field set by the list component.
 */
export const ROLES_CARD_FIELDS: readonly CardField[] = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'permisosCount', label: 'Permisos' },
  { key: 'usuariosCount', label: 'Usuarios' },
];

/**
 * S9.4 — Organizations: nombre | zona | usuarios count.
 * Wire model: IOrganization { name, zone_id }.
 * `zona` and `usuariosCount` are derived fields set by the list component.
 */
export const ORGANIZATIONS_CARD_FIELDS: readonly CardField[] = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'zona', label: 'Zona' },
  { key: 'usuariosCount', label: 'Usuarios' },
];

/**
 * S9.5 — Incident Categories: nombre | descripcion | icon.
 * Wire model: IIncidentCategory { name, description }.
 * `icon` is derived (currently shows as text; icon rendering reserved for D12 future).
 */
export const CATEGORIES_CARD_FIELDS: readonly CardField[] = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'descripcion', label: 'Descripcion' },
  { key: 'icon', label: 'Icono' },
];
