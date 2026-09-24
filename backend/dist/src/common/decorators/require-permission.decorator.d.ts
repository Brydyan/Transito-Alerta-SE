export declare const REQUIRE_PERMISSION_KEY = "atl:require-permission";
export type PermissionAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'ASSIGN' | 'CLAIM' | 'RELEASE' | 'CLOSE' | 'REVEAL';
export interface RequiredPermission {
    action: PermissionAction;
    resource?: string;
}
export declare const RequirePermission: (action: PermissionAction, resource?: string) => MethodDecorator;
export declare function formatPermissionString(action: PermissionAction, resource: string): string;
export declare function inferResourceFromPath(path: string): string;
