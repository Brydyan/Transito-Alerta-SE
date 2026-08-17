/**
 * SubjectScope (T3.2 design D1) — discriminated union, exactly five
 * variants. NEVER represented as a role-name string, a numeric rank, or an
 * optional `organizationId`: the repository must never branch on a role
 * name, and a bare optional org cannot distinguish "global, no filter"
 * from "misconfigured, deny everything" (GeoReporta's bug).
 *
 * `public` and `global` stay separate constructors even though incidents
 * SQL is identical today — narrowing the public view later must not widen
 * or narrow the other.
 */
export type SubjectScope =
  | { kind: 'global' } // sees every organization
  | { kind: 'org'; organizationId: string } // sees one organization
  | { kind: 'org_assigned'; organizationId: string; userId: string } // one org, only own assignments
  | { kind: 'public' } // citizen tier: public data only
  | { kind: 'deny'; reason: 'staff_without_organization' }; // explicit terminal deny

/**
 * Per-request authorization context (design "Interfaces"). `scope` is
 * derived from `roleName`/`organizationId` via `resolveSubjectScope` and
 * is never itself cached (design D6 — derivation is free).
 */
export interface AuthContext {
  userId: string;
  permissions: string[];
  organizationId: string | null;
  roleName: string | null;
  scope: SubjectScope;
}
