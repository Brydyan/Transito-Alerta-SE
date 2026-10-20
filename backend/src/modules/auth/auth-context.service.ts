import { Inject, Injectable, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';

import { AuthConfig } from '../../config/auth.config';
import { AuthContext } from '../../shared/authz/subject-scope';
import { resolveSubjectScope } from '../../shared/authz/resolve-subject-scope';
import { AuthUserRepository } from './auth-user.repository';
import { REDIS_CLIENT } from '../../infra/core.module';

/**
 * Prefijo del árbol de menú cacheado. Duplica `MenusService.CACHE_PREFIX`
 * (`menus.service.ts:37`) a propósito: los dos caches están acoplados por
 * datos — el menú se filtra por el permiso efectivo — así que invalidar uno
 * sin el otro deja la UI mintiendo. Ver `invalidatePermissionCache`.
 */
const MENU_CACHE_PREFIX = 'menu:v1:';

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
  /**
   * 2026-10-18-admin-org-dept-scoping — admin_org's department.
   * `null` para master, agent_system, operator_org, reporter,
   * anonymous, o admin_org legacy sin department. Es REQUIRED en
   * el round-trip: si lo strippeamos, admin_org ve TODA la org
   * (fallback a `'org'` en `resolveSubjectScope`).
   */
  departmentId: string | null;
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
    // 2026-10-20 — cliente del stream, para invalidar `menu:v1:*` (que NO
    // vive en el `CacheModule`). Opcional a propósito: el spec existente
    // `auth-context.service.spec.ts` construye el servicio con 3 argumentos,
    // y que la invalidación de menús degrade a no-op en vez de romper la
    // construcción es el comportamiento correcto cuando el cliente no está.
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: { del(key: string): Promise<unknown> },
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
      // 2026-10-18 — el cache hit debe preservar `departmentId` y
      // delegar el cuarto arg a `resolveSubjectScope`. Sin esto,
      // admin_org con dept poblado cae al fallback `'org'` (ve TODA
      // la org) por un round-trip Redis de hasta 1h.
      return {
        userId,
        permissions: cached.permissions,
        organizationId: cached.organizationId,
        departmentId: cached.departmentId,
        roleName: cached.roleName,
        scope: resolveSubjectScope(
          cached.roleName,
          cached.organizationId,
          cached.departmentId,
          userId,
        ),
        sessionId: null,
        isAnonymous: cached.isAnonymous,
      };
    }

    const row = await this.authUserRepo.findAuthContextRow(userId);

    if (!row) {
      // Do NOT cache a miss (same reasoning as getPermissions): pinning an
      // unknown user id to public/[] for the whole TTL would keep a
      // freshly-provisioned account 403ing until the entry expired.
      // 2026-10-18 — cache miss con usuario inexistente:
      // `departmentId: null` y `resolveSubjectScope(null, null, null, userId)`
      // → `'public'`.
      return {
        userId,
        permissions: [],
        organizationId: null,
        departmentId: null,
        roleName: null,
        scope: resolveSubjectScope(null, null, null, userId),
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
    // 2026-10-18 — `departmentId` sigue el mismo principio que
    // `organizationId`: el path anon lo fuerza a `null` para que el
    // round-trip cache no contamine la identidad anónima. roleDeleted
    // cae a `null` por el mismo principio que `roleName` (el rol está
    // soft-deleted ⇒ no aplica scope).
    const departmentId = isAnonymous || roleDeleted ? null : row.department_id;
    const roleName = isAnonymous || roleDeleted ? null : row.role_name;

    await this.cache.set(
      key,
      // 2026-10-18 — `departmentId` se persiste en el cache (mismo TTL
      // de `permissions`) para que el round-trip Redis reconstruya el
      // scope `'department'` en el cache hit. Si lo omitimos, el cache
      // hit ve `departmentId: undefined` y admin_org con dept poblado
      // degenera al fallback `'org'` durante todo el TTL.
      { permissions, organizationId, departmentId, roleName, isAnonymous },
      permissionCacheTtlSeconds * 1000,
    );

    return {
      userId,
      permissions,
      organizationId,
      departmentId,
      roleName,
      scope: resolveSubjectScope(roleName, organizationId, departmentId, userId),
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

    // 2026-10-20 — el árbol de menú también depende de estos permisos.
    //
    // `MenusService` filtra cada entrada por el permiso efectivo del usuario
    // (`menus.service.ts:21-22,43-45`), así que `menu:v1:user:{id}` es caché
    // DERIVADA de `perm:v3:*`. Invalidar sólo el padre dejaba el hijo
    // mintiendo: tras un soft-delete de rol los permisos se revocaban
    // correctamente pero el sidebar seguía mostrando el menú viejo hasta el
    // TTL (1 h).
    //
    // Se limpia acá y no en `RolesService` a propósito: TODOS los callers de
    // esta méthode (assignRole, update, delete, recalculateEffectivePermissions)
    // pasan por acá, así que un solo cambio los cubre. Limpiarlo sólo en
    // `delete` habría dejado los otros tres caminos con el mismo bug.
    //
    // El prefijo duplica el de `menus.service.ts:37`. Es acoplamiento
    // deliberado entre dos caches que sí están acoplados por datos; la
    // alternativa —un bus de invalidación— es más ceremonia que lo que un
    // prefijo compartido cuesta acá.
    deletes.push(this.redisDel(`${MENU_CACHE_PREFIX}user:${userId}`));

    await Promise.all(deletes);
  }

  /**
   * Borra una clave del cliente Redis del outbox/streams, donde vive
   * `menu:v1:*` (`MenusService` inyecta `REDIS_CLIENT`, no el `CacheModule` —
   * `menus.service.ts:55-56`). Envuelto porque si el cliente no está
   * disponible la invalidación de permisos NO debe fallar: el TTL de 1 h ya
   * la deja como último recurso.
   */
  private async redisDel(key: string): Promise<void> {
    try {
      await this.redis?.del(key);
    } catch {
      // no-op: el cache expira solo.
    }
  }
}
