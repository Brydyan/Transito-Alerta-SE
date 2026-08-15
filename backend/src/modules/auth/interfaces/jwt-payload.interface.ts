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
}
