import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionAction } from '../decorators/require-permission.decorator';
import { PermissionLookupService } from '../permissions/permission-lookup.service';
export declare function hasPermission(userPermissions: string[], action: PermissionAction, resource: string, lookup: PermissionLookupService): Promise<boolean>;
export declare class PermissionGuard implements CanActivate {
    private readonly reflector;
    private readonly lookup;
    constructor(reflector: Reflector, lookup: PermissionLookupService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
