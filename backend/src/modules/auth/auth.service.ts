import { randomUUID } from 'crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import type { Cache } from 'cache-manager';
import { DataSource, Repository } from 'typeorm';

import { UserEntity } from '../../entities/user.entity';
import { AuthConfig } from '../../config/auth.config';
import { AuthContext } from '../../common/authz/subject-scope';
import { resolveSubjectScope } from '../../common/authz/resolve-subject-scope';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * T3.2 design D6: reshaped to `perm:v2:` (both the device_uuid-keyed and
 * uid-keyed variants) — the uid-keyed cached value's shape changes from
 * `string[]` to an `AuthContext`-shaped object, and the legacy `perm:`
 * prefix must NEVER be reused for a differently-shaped value (a deploy
 * against a warm Redis would otherwise read `cached.permissions ===
 * undefined` and 403 every request for up to the full TTL). Old `perm:`
 * keys are abandoned, not migrated — they simply expire.
 */
export const PERMISSION_CACHE_PREFIX = 'perm:v2:';

interface CachedAuthContext {
  permissions: string[];
  organizationId: string | null;
  roleName: string | null;
}

interface AuthContextRow {
  permissions: string[] | null;
  organization_id: string | null;
  device_uuid: string;
  role_name: string | null;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  permissions: string[];
}

/**
 * AuthService — device-UUID identity + dual JWT + Redis-cached permissions.
 * Implements D1 (identity spectrum), D2 (permissions in Redis, not JWT
 * claims), and CC2 (dual anonymous/authenticated identity).
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private get authConfig(): AuthConfig {
    return this.configService.get<AuthConfig>('auth')!;
  }

  async login(deviceUuid: string): Promise<AuthTokens> {
    if (!deviceUuid || !deviceUuid.trim()) {
      throw new UnauthorizedException('device_uuid is required');
    }

    let user = await this.userRepo.findOne({ where: { deviceUuid } });
    if (!user) {
      user = this.userRepo.create({ deviceUuid, permissions: [], isActive: true });
      user = await this.userRepo.save(user);
    }

    // Passive fan-out (design D7): UsersService listens for this to record
    // a lightweight session-tracking row on new-device login (spec R4).
    // AuthModule does not import UsersModule to avoid a circular DAG edge.
    this.eventEmitter.emit('auth.login', { userId: user.id, deviceUuid });

    const permissions = await this.getPermissions(deviceUuid);
    const accessToken = this.signAccessToken(user.id);
    const refreshToken = this.signRefreshToken(user.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      permissions,
    };
  }

  async refresh(refreshToken: string): Promise<{ access_token: string }> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.authConfig.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('User not found for refresh token');
    }

    return { access_token: this.signAccessToken(user.id) };
  }

  validateToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token, {
        secret: this.authConfig.jwtAccessSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /** GET /api/auth/me support — resolves device_uuid + permissions for a user id. */
  async getMe(userId: string): Promise<{ deviceUuid: string; permissions: string[] }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const permissions = await this.getPermissions(user.deviceUuid);
    return { deviceUuid: user.deviceUuid, permissions };
  }

  async getPermissions(deviceUuid: string): Promise<string[]> {
    const { anonymousDeviceUuid, anonymousPermissions, permissionCacheTtlSeconds } =
      this.authConfig;

    if (deviceUuid === anonymousDeviceUuid) {
      return anonymousPermissions;
    }

    const key = `${PERMISSION_CACHE_PREFIX}${deviceUuid}`;
    const cached = await this.cache.get<string[]>(key);
    if (cached) {
      return cached;
    }

    const user = await this.userRepo.findOne({ where: { deviceUuid } });
    if (!user) {
      // Do NOT cache a miss: pinning an unknown device to [] for the whole TTL
      // would keep a freshly-provisioned account 403ing until the entry expired.
      return [];
    }

    const permissions = user.permissions ?? [];
    await this.cache.set(key, permissions, permissionCacheTtlSeconds * 1000);
    return permissions;
  }

  /**
   * Resolves permissions from a user id (the JWT `sub` claim). Thin
   * wrapper (T3.2 design D6) — {@link getAuthContextByUserId} is now the
   * single source, so every existing caller of this method keeps working
   * unchanged.
   */
  async getPermissionsByUserId(userId: string): Promise<string[]> {
    return (await this.getAuthContextByUserId(userId)).permissions;
  }

  /**
   * Resolves the full per-request `AuthContext` (permissions +
   * organizationId + roleName + derived scope) from a user id in ONE
   * query, cached under `perm:v2:uid:{userId}` (T3.2 design D6).
   *
   * The anonymous branch CANNOT short-circuit before the query on the uid
   * path — `userId` alone does not reveal the device (design "Correction
   * to the proposal's wording"). `device_uuid` is loaded, then checked:
   * when it equals the configured anonymous device, `permissions` is
   * replaced by `anonymousPermissions` and org/role are forced to `null`
   * — the DB row's own `permissions` are ignored for it, so the anonymous
   * ceiling stays governed by `auth.config.ts` alone.
   *
   * `scope` is derived, never cached (derivation is free; caching it
   * would create a second thing to invalidate).
   */
  async getAuthContextByUserId(userId: string): Promise<AuthContext> {
    const { anonymousDeviceUuid, anonymousPermissions, permissionCacheTtlSeconds } =
      this.authConfig;

    const key = `${PERMISSION_CACHE_PREFIX}uid:${userId}`;
    const cached = await this.cache.get<CachedAuthContext>(key);
    if (cached) {
      return {
        userId,
        permissions: cached.permissions,
        organizationId: cached.organizationId,
        roleName: cached.roleName,
        scope: resolveSubjectScope(cached.roleName, cached.organizationId, userId),
      };
    }

    const rows: AuthContextRow[] = await this.dataSource.query(
      `SELECT u.permissions, u.organization_id, u.device_uuid, r.name AS role_name
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1`,
      [userId],
    );
    const row = rows[0];

    if (!row) {
      // Do NOT cache a miss (same reasoning as getPermissions): pinning an
      // unknown user id to public/[] for the whole TTL would keep a
      // freshly-provisioned account 403ing until the entry expired.
      return {
        userId,
        permissions: [],
        organizationId: null,
        roleName: null,
        scope: resolveSubjectScope(null, null, userId),
      };
    }

    const isAnonymous = row.device_uuid === anonymousDeviceUuid;
    const permissions = isAnonymous ? anonymousPermissions : (row.permissions ?? []);
    const organizationId = isAnonymous ? null : row.organization_id;
    const roleName = isAnonymous ? null : row.role_name;

    await this.cache.set(
      key,
      { permissions, organizationId, roleName },
      permissionCacheTtlSeconds * 1000,
    );

    return {
      userId,
      permissions,
      organizationId,
      roleName,
      scope: resolveSubjectScope(roleName, organizationId, userId),
    };
  }

  /**
   * Invalidates a user's cached permission blob under BOTH keying schemes
   * (design D2's `pv` bump). Called by RolesService.assignRole after a
   * role reassignment writes new permissions to the user row, so the very
   * next request rebuilds `perm:*` from the DB instead of serving the
   * stale cached set for up to `permissionCacheTtlSeconds` more.
   */
  async invalidatePermissionCache(userId: string, deviceUuid: string): Promise<void> {
    await Promise.all([
      this.cache.del(`${PERMISSION_CACHE_PREFIX}${deviceUuid}`),
      this.cache.del(`${PERMISSION_CACHE_PREFIX}uid:${userId}`),
    ]);
  }

  private signAccessToken(userId: string): string {
    const payload: JwtPayload = { sub: userId, typ: 'access', jti: randomUUID(), pv: 1 };
    return this.jwtService.sign(payload, {
      secret: this.authConfig.jwtAccessSecret,
      expiresIn: this.authConfig.jwtAccessExpiresIn,
    });
  }

  private signRefreshToken(userId: string): string {
    const payload: JwtPayload = { sub: userId, typ: 'refresh', jti: randomUUID(), pv: 1 };
    return this.jwtService.sign(payload, {
      secret: this.authConfig.jwtRefreshSecret,
      expiresIn: this.authConfig.jwtRefreshExpiresIn,
    });
  }
}
