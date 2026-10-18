import { SubjectScope } from './subject-scope';

export interface ScopeSqlOptions {
  /** Table name or alias the fragment's bare columns refer to. */
  table: string;
  /** 1-based index of the first `$n` parameter this fragment may use. */
  paramOffset: number;
}

export interface ScopeSqlResult {
  fragment: string;
  params: unknown[];
}

/**
 * Translates a `SubjectScope` into a SQL WHERE fragment + its bound
 * parameters (T3.2 design D3). Per-resource translation lives here, once,
 * instead of duplicated in five repositories.
 *
 * `deny` -> `FALSE` (never `WHERE 1=0` on a NULL comparison) so the deny
 * case is an intentional value, never an accidental
 * `organization_id = NULL`.
 */
export function scopeToSql(scope: SubjectScope, opts: ScopeSqlOptions): ScopeSqlResult {
  const { table, paramOffset } = opts;

  switch (scope.kind) {
    case 'global':
    case 'public':
      return { fragment: 'TRUE', params: [] };
    case 'deny':
      return { fragment: 'FALSE', params: [] };
    case 'org':
      return {
        fragment: `organization_id = $${paramOffset}`,
        params: [scope.organizationId],
      };
    case 'org_assigned':
      return {
        fragment:
          `organization_id = $${paramOffset} AND EXISTS ` +
          `(SELECT 1 FROM assignments a WHERE a.incident_id = ${table}.id ` +
          `AND a.operator_id = $${paramOffset + 1})`,
        params: [scope.organizationId, scope.userId],
      };
    // 2026-10-18-admin-org-dept-scoping — admin_org scoped a un
    // único departamento. Misma forma que `org` pero filtrando por
    // `department_id`. Para `incidents` el filtro es suficiente; el
    // listado de usuarios vive en `users.service.ts` (no aquí) por
    // convención del repo.
    case 'department':
      return {
        fragment: `department_id = $${paramOffset}`,
        params: [scope.departmentId],
      };
  }
}

/**
 * Cache-key discriminator for a scope (design "Cache Key Reshape" /
 * "Scope-blind list cache" risk mitigation). `public` and `global` get
 * DISTINCT keys so a future narrowing of the public view cannot poison
 * the admin view.
 */
export function scopeCacheKey(scope: SubjectScope): string {
  switch (scope.kind) {
    case 'global':
      return 'g';
    case 'public':
      return 'p';
    case 'deny':
      return 'deny';
    case 'org':
      return `o:${scope.organizationId}`;
    case 'org_assigned':
      return `oa:${scope.organizationId}:${scope.userId}`;
    // 2026-10-18 — clave distinta de `org`/`org_assigned` para que un
    // cambio de department (futuro endpoint de reassign) invalide
    // automáticamente el cache de lista sin tener que purgarlo
    // explícitamente.
    case 'department':
      return `d:${scope.organizationId}:${scope.departmentId}`;
  }
}
