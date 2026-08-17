import { SubjectScope } from './subject-scope';

/**
 * Pure function, zero I/O (T3.2 design D1/D2). Maps `(roleName,
 * organizationId)` to a `SubjectScope` per the proposal's role table.
 * `operador_sistema` is an EXPLICIT `case`, never a fallthrough — the
 * GeoReporta accident this task exists to avoid repeating. `default:
 * public` covers `role_id IS NULL` (unranked, D2) and any unknown role
 * name, reproducing today's unscoped behaviour exactly.
 */
export function resolveSubjectScope(
  roleName: string | null,
  organizationId: string | null,
  userId?: string,
): SubjectScope {
  switch (roleName) {
    case 'admin_sistema':
      return { kind: 'global' };
    case 'operador_sistema':
      return { kind: 'global' };
    case 'admin_organizacion':
      return organizationId === null
        ? { kind: 'deny', reason: 'staff_without_organization' }
        : { kind: 'org', organizationId };
    case 'operador_organizacion':
      return organizationId === null || userId === undefined
        ? { kind: 'deny', reason: 'staff_without_organization' }
        : { kind: 'org_assigned', organizationId, userId };
    default:
      return { kind: 'public' };
  }
}
