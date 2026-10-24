import { SubjectScope } from './subject-scope';

/**
 * Pure function, zero I/O (T3.2 design D1/D2). Maps `(roleName,
 * organizationId, departmentId, userId)` to a `SubjectScope` per the
 * proposal's role table. `agent_system` is an EXPLICIT `case`, never a
 * fallthrough — the GeoReporta accident this task exists to avoid
 * repeating. `default: public` covers `role_id IS NULL` (unranked, D2)
 * and any unknown role name, reproducing today's unscoped behaviour
 * exactly.
 *
 * 2026-10-18-admin-org-dept-scoping — nuevo parámetro `departmentId`
 * (tercer arg, antes de `userId`). Sólo `admin_org` lo consume:
 *  - con departmentId poblado → `'department'` scope
 *  - con departmentId null → fallback a `'org'` (back-compat para
 *    admin_org legacy que no tiene department)
 *  - con organizationId null → `'deny'` (caso invariante)
 *
 * El parámetro va antes de `userId?` para mantener back-compat en los
 * callers existentes: agregar `undefined` como tercer argumento es
 * opcional y el sufijo opcional sigue funcionando igual.
 */
export function resolveSubjectScope(
  roleName: string | null,
  organizationId: string | null,
  departmentId: string | null,
  userId?: string,
): SubjectScope {
  switch (roleName) {
    case 'master':
      return { kind: 'global' };
    case 'agent_system':
      return { kind: 'global' };
    case 'admin_org':
      // admin_org scoped to department (supervisor role)
      if (organizationId === null) {
        return { kind: 'deny', reason: 'staff_without_organization' };
      }
      if (departmentId === null || departmentId === undefined) {
        // Fallback a org-level si no hay department (no debería
        // pasar en producción — el seed SIEMPRE popula departmentId
        // para admin_org — pero la rama defensiva evita un deny
        // inesperado si una migración o seed queda con el orden
        // incorrecto).
        return { kind: 'org', organizationId };
      }
      return { kind: 'department', organizationId, departmentId };
    case 'operator_org':
      // operator_org NO consume departmentId — su scope sigue
      // siendo 'org_assigned' (ver sólo sus assignments).
      return organizationId === null || userId === undefined
        ? { kind: 'deny', reason: 'staff_without_organization' }
        : { kind: 'org_assigned', organizationId, userId };
    default:
      return { kind: 'public' };
  }
}
