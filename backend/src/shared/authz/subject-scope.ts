/**
 * SubjectScope (T3.2 design D1) — discriminated union. NEVER represented as a
 * role-name string, a numeric rank, or an optional `organizationId`: the
 * repository must never branch on a role name, and a bare optional org
 * cannot distinguish "global, no filter" from "misconfigured, deny
 * everything" (GeoReporta's bug).
 *
 * `public` and `global` stay separate constructors even though incidents
 * SQL is identical today — narrowing the public view later must not widen
 * or narrow the other.
 *
 * 2026-10-18-admin-org-dept-scoping — agregada la variante `'department'`
 * (admin_org con departmentId poblado). Cae a `'org'` como fallback
 * cuando el admin_org no tiene department (back-compat: el seed actual
 * de admin_org SÍ lo popula, pero el código no asume — ver `resolve-subject-scope.ts`).
 */
export type SubjectScope =
  | { kind: 'global' } // sees every organization
  | { kind: 'org'; organizationId: string } // sees one organization
  | { kind: 'org_assigned'; organizationId: string; userId: string } // one org, only own assignments
  | { kind: 'department'; organizationId: string; departmentId: string } // admin_org scoped to ONE department
  | { kind: 'public' } // citizen tier: public data only
  | { kind: 'deny'; reason: 'staff_without_organization' }; // explicit terminal deny

/**
 * Per-request authorization context (design "Interfaces"). `scope` is
 * derived from `roleName`/`organizationId`/`departmentId` via
 * `resolveSubjectScope` and is never itself cached (design D6 —
 * derivation is free).
 */
export interface AuthContext {
  userId: string;
  permissions: string[];
  organizationId: string | null;
  /** 2026-10-18 — admin_org's department for `'department'` scope. */
  departmentId: string | null;
  roleName: string | null;
  scope: SubjectScope;
  /**
   * T3.9 design §6 — the session id (`user_sessions.id`, the JWT `sid`
   * claim), or `null` for anonymous identities (which mint no session).
   * REQUIRED (not optional): every construction site must supply it, so a
   * missing value fails `tsc` instead of silently defaulting (the T3.2
   * "enforcement is a parameter" rule).
   */
  sessionId: string | null;
  /**
   * T3.9 design §3 [R4] — server-derived from `device_uuid ===
   * anonymousDeviceUuid`, never trusted from the client. REQUIRED so
   * `JwtStrategy.validate` can always branch on it without an `undefined`
   * reading falsy in a security-relevant check.
   */
  isAnonymous: boolean;
}
