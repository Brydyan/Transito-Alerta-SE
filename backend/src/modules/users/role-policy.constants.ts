/**
 * F7 — User Onboarding & Telegram Tour (2026-10-10). Role-vs-organization
 * policy constants used by `UsersService.adminCreate` / `adminUpdate`
 * and the frontend `NewUserFormComponent` to keep both sides in sync
 * (D6 / R1).
 *
 * - `ROLES_REQUIRING_ORG_AND_DEPT`: sectional roles. Both
 *   `organization_id` and `department_id` are required and the
 *   department must belong to the organization.
 * - `ROLES_NOT_REQUIRING_ORG`: global roles. Both fields are forced
 *   to `null` regardless of what the DTO carries — the DTO
 *   accepts them for ergonomic frontend rendering, but the
 *   service discards them.
 *
 * `reporter` (citizen) is intentionally NOT listed: that flow does
 * not go through adminCreate at all (it goes through the public
 * `POST /api/auth/register`). The D7 isolation invariant is
 * enforced structurally by which service each flow uses.
 */
export const ROLES_REQUIRING_ORG_AND_DEPT: ReadonlyArray<string> = [
  'admin_org',
  'operator_org',
];

export const ROLES_NOT_REQUIRING_ORG: ReadonlyArray<string> = [
  'master',
  'agent_system',
];

export function requiresOrgAndDept(roleName: string | null | undefined): boolean {
  return ROLES_REQUIRING_ORG_AND_DEPT.includes(roleName ?? '');
}
