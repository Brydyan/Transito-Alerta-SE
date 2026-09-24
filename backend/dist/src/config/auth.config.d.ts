export interface AuthConfig {
    jwtAccessSecret: string;
    jwtRefreshSecret: string;
    jwtAccessExpiresIn: string;
    jwtRefreshExpiresIn: string;
    permissionCacheTtlSeconds: number;
    anonymousDeviceUuid: string;
    anonymousPermissions: string[];
    sessionRefreshGraceSeconds: number;
    sessionRefreshTtlSeconds: number;
    bcryptCost: number;
    passwordMinLength: number;
}
export declare function parseDurationSeconds(value: string): number;
declare const _default: (() => AuthConfig) & import("@nestjs/config").ConfigFactoryKeyHost<AuthConfig>;
export default _default;
