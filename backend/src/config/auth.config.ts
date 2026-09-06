import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  permissionCacheTtlSeconds: number;
  anonymousDeviceUuid: string;
  anonymousPermissions: string[];
  /** T3.9 design §6 [R5] — grace window for the benign-retry (in-window
   * previous-token replay) path, in seconds. Env `SESSION_REFRESH_GRACE_SECONDS`. */
  sessionRefreshGraceSeconds: number;
  /** T3.9 design §6 [R5] — `jwtRefreshExpiresIn` ('7d') parsed to an
   * integer number of seconds, needed by the rotation SQL and `create()`. */
  sessionRefreshTtlSeconds: number;
  /**
   * T3.6 — bcrypt cost factor for `PasswordHasher`. Config-driven (never a
   * hardcoded literal in service code) so unit tests can override to a
   * cheap cost (4) while production stays at 12. Env `BCRYPT_COST`.
   */
  bcryptCost: number;
  /**
   * T3.6 — minimum password length ("a length floor", spec). No
   * composition rules. Env `PASSWORD_MIN_LENGTH`, default 12.
   */
  passwordMinLength: number;
}

const DURATION_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

/**
 * Parses a duration string like `'7d'`, `'15m'`, `'30s'` into an integer
 * number of seconds (T3.9 design §6 [R5]). Pure function — no I/O.
 *
 * Throws on anything that doesn't match `<integer><unit>` where unit is one
 * of `s`/`m`/`h`/`d` — never silently coerces to `NaN` or `0`, since that
 * value feeds directly into `make_interval(secs => ...)` in the rotation
 * SQL statement.
 */
export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration string: "${value}" (expected e.g. "7d", "15m", "30s")`);
  }
  const [, amount, unit] = match;
  return parseInt(amount, 10) * DURATION_UNIT_SECONDS[unit];
}

/**
 * Auth configuration (D1/D2/D3).
 *
 * - Dual JWT secrets (access/refresh) per design D2.
 * - Anonymous identity ceiling (device_uuid='anonymous') per blocker
 *   resolution #4 (round 0) — REVOCADO por ANON (sc-326, ronda 1).
 *   La identidad anónima ya no concede nada: ni lectura ni escritura.
 *   La invariante la cubre el spec de `auth.config.spec.ts` (B.5 + B.6).
 *   La fila máscara sigue presente en la BD porque AUD la recicla
 *   como autoría de publicaciones; la migración 0048 vacía su
 *   `permissions` para reflejar el nuevo estado.
 */
export default registerAs('auth', (): AuthConfig => {
  const jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
  return {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    jwtRefreshExpiresIn,
    permissionCacheTtlSeconds: process.env.PERMISSION_CACHE_TTL_SECONDS
      ? parseInt(process.env.PERMISSION_CACHE_TTL_SECONDS, 10)
      : 3600,
    anonymousDeviceUuid: 'anonymous',
    // ANON (sc-326) — la lista está VACÍA. La identidad
    // anónima ya no concede nada: ni lectura ni escritura.
    // Mantener la lista no-vacía reintroduciría el techo
    // que el round 0 tenía y que esta fase cierra. La
    // invariante está cubierta por `auth.config.spec.ts`
    // (B.5 + B.6) y por la rama `isAnonymous` en
    // `getAuthContextByUserId`, que ahora siempre devuelve
    // `permissions: []` para la fila máscara.
    anonymousPermissions: [],
    sessionRefreshGraceSeconds: process.env.SESSION_REFRESH_GRACE_SECONDS
      ? parseInt(process.env.SESSION_REFRESH_GRACE_SECONDS, 10)
      : 30,
    sessionRefreshTtlSeconds: parseDurationSeconds(jwtRefreshExpiresIn),
    bcryptCost: process.env.BCRYPT_COST ? parseInt(process.env.BCRYPT_COST, 10) : 12,
    passwordMinLength: process.env.PASSWORD_MIN_LENGTH
      ? parseInt(process.env.PASSWORD_MIN_LENGTH, 10)
      : 12,
  };
});
