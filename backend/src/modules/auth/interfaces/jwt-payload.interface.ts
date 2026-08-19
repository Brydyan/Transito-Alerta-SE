/**
 * JWT payload shape — design D2/D3 `interfaces` section.
 * Permissions are intentionally NOT embedded here; PermissionGuard resolves
 * them from Redis `perm:{sub}` (or device_uuid keyed cache) at request time.
 */
export interface JwtPayload {
  sub: string; // user id (anon or account)
  typ: 'access' | 'refresh';
  jti: string; // refresh rotation / revocation
  pv: number; // permission version — bump invalidates cached permission blob
  /**
   * T3.9 design §6 — the session id (`user_sessions.id`). OPTIONAL in the
   * type because anonymous tokens carry none (D8): forcing `sid: ''` at the
   * anonymous mint site would be a lie the compiler would then stop
   * questioning. REQUIRED at runtime for every non-anonymous identity —
   * enforced at exactly two places: `JwtStrategy.validate` and
   * `AuthService.refresh`.
   */
  sid?: string;
}
