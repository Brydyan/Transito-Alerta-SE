import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  permissionCacheTtlSeconds: number;
  anonymousDeviceUuid: string;
  anonymousPermissions: string[];
}

/**
 * Auth configuration (D1/D2/D3).
 *
 * - Dual JWT secrets (access/refresh) per design D2.
 * - Anonymous identity ceiling (device_uuid='anonymous') per blocker
 *   resolution #4: read what the public posted and contribute to it, never
 *   modify. READ/CREATE incidents, READ/CREATE comments — no UPDATE, DELETE
 *   or ASSIGN, not even over its own rows.
 */
export default registerAs(
  'auth',
  (): AuthConfig => ({
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    permissionCacheTtlSeconds: process.env.PERMISSION_CACHE_TTL_SECONDS
      ? parseInt(process.env.PERMISSION_CACHE_TTL_SECONDS, 10)
      : 3600,
    anonymousDeviceUuid: 'anonymous',
    anonymousPermissions: [
      'READ incidents',
      'CREATE incidents',
      'READ comments',
      'CREATE comments',
    ],
  }),
);
