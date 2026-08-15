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
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../decorators/require-permission.decorator';

/**
 * Checks whether a flat permission-string array (e.g. ["READ incidents"])
 * grants the given action+resource. Default-deny (R7): absence => false.
 * Pure function — no side effects.
 */
export function hasPermission(
  userPermissions: string[],
  action: string,
  resource: string,
): boolean {
  return userPermissions.includes(formatPermissionString(action as any, resource));
}

/**
 * PermissionGuard (CC1) — resource+action authorization.
 * Permission list is expected on `request.user.permissions`, populated by
 * JwtStrategy/AuthGuard reading Redis `perm:{sub}` (design D2).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    if (!hasPermission(userPermissions, required.action, resource)) {
      throw new ForbiddenException(
        `Missing permission: ${formatPermissionString(required.action, resource)}`,
      );
    }

    return true;
  }
}
