import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  formatPermissionString,
  inferResourceFromPath,
  PermissionAction,
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../decorators/require-permission.decorator';
import { PermissionLookupService } from '../permissions/permission-lookup.service';

/**
 * Checks whether a flat permission-string array (e.g. ["uuid-1",
 * "uuid-2", …]) grants the given action+resource.
 *
 * F6 fix (post-0051): el wire es UUIDs. Antes era
 * `userPermissions.includes("READ roles")` (string formateado)
 * — pero las perms se almacenan como UUIDs desde la migration
 * 0051, así que el `includes` siempre daba `false` → 403 a
 * master para todo. El fix: traducir `(action, resource)` a
 * UUID vía `PermissionLookupService` y comparar contra los
 * UUIDs del usuario.
 */
export async function hasPermission(
  userPermissions: string[],
  action: PermissionAction,
  resource: string,
  lookup: PermissionLookupService,
): Promise<boolean> {
  const uuid = await lookup.getUuid(action, resource);
  return uuid !== null && userPermissions.includes(uuid);
}

/**
 * PermissionGuard (CC1) — resource+action authorization.
 * Permission list is expected on `request.user.permissions`,
 * populated by JwtStrategy/AuthGuard reading Redis
 * `perm:{sub}` (design D2). Los valores son UUIDs
 * (migration 0051); el guard usa `PermissionLookupService`
 * para traducir `(action, resource)` → UUID antes de comparar.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly lookup: PermissionLookupService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredPermission | undefined>(
      REQUIRE_PERMISSION_KEY,
      context.getHandler(),
    );

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const resource = required.resource ?? inferResourceFromPath(request.path ?? '');
    const userPermissions: string[] = request.user?.permissions ?? [];

    const ok = await hasPermission(
      userPermissions,
      required.action,
      resource,
      this.lookup,
    );
    if (!ok) {
      throw new ForbiddenException(
        `Missing permission: ${formatPermissionString(required.action, resource)}`,
      );
    }

    return true;
  }
}
