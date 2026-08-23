/**
 * Roles that only system administrators can see in user-management form
 * reference data (T5.4 design D4). Mirrors GeoReporta's UserRole enum
 * exclusion list. Treated as a `const` tuple so call sites can spread it
 * into SQL `NOT IN (...)` clauses without re-allocating.
 */
export const SYSTEM_ONLY_ROLES = [
  'admin_sistema',
  'operador_sistema',
  'admin_legacy',
] as const;

export type SystemOnlyRole = (typeof SYSTEM_ONLY_ROLES)[number];

/** Used by getFormData to decide whether to filter roles/orgs. */
export const SYSTEM_ADMIN_ROLE_NAME = 'admin_sistema';
