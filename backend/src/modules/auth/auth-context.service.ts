import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';

import { AuthConfig } from '../../config/auth.config';
import { AuthContext } from '../../shared/authz/subject-scope';
import { resolveSubjectScope } from '../../shared/authz/resolve-subject-scope';
import { AuthUserRepository } from './auth-user.repository';

/**
 * T3.9 design §3 [R4]: reshaped to `perm:v3:` — `AuthContext` gains
 * `isAnonymous`, which is NOT derivable from the cached `{permissions,
 * organizationId, roleName}` triple (a real user may legitimately have
 * both null). A warm Redis under the old `perm:v2:` prefix would read
 * `cached.isAnonymous === undefined` (falsy) and 401 every anonymous
 * device for a full TTL — so `perm:v2:` keys are abandoned, not migrated,
 * exactly as `perm:` was abandoned for `perm:v2:` in T3.2.
 */
export const PERMISSION_CACHE_PREFIX = 'perm:v3:';

interface CachedAuthContext {
  permissions: string[];
  organizationId: string | null;
  roleName: string | null;
  isAnonymous: boolean;
}

/**
 * AuthContextService (sc-413, Slice B) — owns permission resolution and the
 * Redis permission cache (`perm:v3:`). Extracted verbatim from
 * `AuthService` so the auth service stops carrying `CACHE_MANAGER` and the
 * permission/cache concern lives in one place. `AuthService` keeps its
 * public methods as thin delegates, so existing callers
 * (`jwt.strategy`, `realtime/events.gateway`, `menus.service`,
 * `roles.service`, `users.service`) are unaffected.
 *
 * Two keying schemes coexist by design (T3.2 D6): device-keyed
 * (`perm:v3:{deviceUuid}`, `getPermissions`) and uid-keyed
 * (`perm:v3:uid:{userId}`, `getAuthContextByUserId`) — the latter is what
 * `JwtStrategy` resolves per request via `getPermissionsByUserId`.
 */
@Injectable()
export class AuthContextService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly configService: ConfigService,
    private readonly authUserRepo: AuthUserRepository,
  ) {}

  private get authConfig(): AuthConfig {
    return this.configService.get<AuthConfig>('auth')!;
  }

  /**
   * T3.6 D8 — `deviceUuid: null` returns `[]` immediately, no cache
   * read/write. Password-only users never resolve permissions through this
   * device-keyed method (see `AuthService.getMe`/`loginWithPassword`, both of
   * which use `getPermissionsByUserId` instead) — this guard exists purely so
   * a caller that still has only a `null` device cannot accidentally read or
   * poison the shared `perm:v3:null` key.
   */
  async getPermissions(deviceUuid: string | null): Promise<string[]> {
    if (deviceUuid === null) {
      return [];
    }

    // ANON (sc-326) — la rama `if (deviceUuid === anonymousDeviceUuid)`
    // se eliminó: `AuthService.login` ya rechaza ese `deviceUuid`
    // con 401 ANONYMOUS_IDENTITY_CLOSED ANTES de llegar a
    // `getPermissions`. La rama anterior era inalcanzable; mantenerla
    // como defensa en profundidad duplicaba una invariante que ahora
    // vive en un solo lugar (la guard de `login`). Si en el futuro
    // se quiere restaurar el acceso anónimo, lo correcto
    // es quitar el rechazo en `login` — no reintroducir esta
    // rama muerta.
    const { permissionCacheTtlSeconds } = this.authConfig;

    const key = `${PERMISSION_CACHE_PREFIX}${deviceUuid}`;
    const cached = await this.cache.get<string[]>(key);
    if (cached) {
      return cached;
    }

    const user = await this.authUserRepo.findByDeviceUuid(deviceUuid);
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
   * organizationId + roleName + derived scope + isAnonymous) from a user
   * id in ONE query, cached under `perm:v3:uid:{userId}` (T3.2 design D6,
   * T3.9 design §3 [R4]).
   *
   * `sessionId` is ALWAYS returned `null` here — it is NOT derivable from
   * `userId` alone (a user can hold many sessions); `JwtStrategy.validate`
   * attaches the real value from the JWT's own `sid` claim after this call
   * returns (design §3).
   *
   * The anonymous branch CANNOT short-circuit before the query on the uid
   * path — `userId` alone does not reveal the device. `device_uuid` is
   * loaded, then checked: when it equals the configured anonymous device,
   * `permissions` is replaced by `anonymousPermissions` and org/role are
   * forced to `null`.
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
        sessionId: null,
        isAnonymous: cached.isAnonymous,
      };
    }

    const row = await this.authUserRepo.findAuthContextRow(userId);

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
        sessionId: null,
        isAnonymous: false,
      };
    }

    const isAnonymous = row.device_uuid === anonymousDeviceUuid;
    // R7.5 — a soft-deleted assigned role grants nothing, regardless of
    // what's still denormalized onto `users.permissions`.
    const roleDeleted = row.role_deleted_at != null;
    const permissions = isAnonymous
      ? anonymousPermissions
      : roleDeleted
        ? []
        : (row.permissions ?? []);
    const organizationId = isAnonymous ? null : row.organization_id;
    const roleName = isAnonymous || roleDeleted ? null : row.role_name;

    await this.cache.set(
      key,
      { permissions, organizationId, roleName, isAnonymous },
      permissionCacheTtlSeconds * 1000,
    );

    return {
      userId,
      permissions,
      organizationId,
      roleName,
      scope: resolveSubjectScope(roleName, organizationId, userId),
      sessionId: null,
      isAnonymous,
    };
  }

  /**
   * Invalidates a user's cached permission blob under BOTH keying schemes
   * (design D2's `pv` bump). Called by `RolesService.assignRole` after a
   * role reassignment writes new permissions to the user row, so the very
   * next request rebuilds `perm:*` from the DB instead of serving the
   * stale cached set for up to `permissionCacheTtlSeconds` more.
   *
   * T3.6 D8: `deviceUuid: null` skips the device-keyed `cache.del` — there
   * is no `perm:v3:null` key to clean up, and issuing that delete would be
   * a harmless-but-pointless no-op every place this is now called for a
   * password-only user.
   */
  async invalidatePermissionCache(userId: string, deviceUuid: string | null): Promise<void> {
    const deletes = [this.cache.del(`${PERMISSION_CACHE_PREFIX}uid:${userId}`)];
    if (deviceUuid !== null) {
      deletes.push(this.cache.del(`${PERMISSION_CACHE_PREFIX}${deviceUuid}`));
    }
    await Promise.all(deletes);
  }
}
