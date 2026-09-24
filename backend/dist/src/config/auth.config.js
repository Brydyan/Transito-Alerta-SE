"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDurationSeconds = parseDurationSeconds;
const config_1 = require("@nestjs/config");
const DURATION_UNIT_SECONDS = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
};
function parseDurationSeconds(value) {
    const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
    if (!match) {
        throw new Error(`Invalid duration string: "${value}" (expected e.g. "7d", "15m", "30s")`);
    }
    const [, amount, unit] = match;
    return parseInt(amount, 10) * DURATION_UNIT_SECONDS[unit];
}
exports.default = (0, config_1.registerAs)('auth', () => {
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
//# sourceMappingURL=auth.config.js.map