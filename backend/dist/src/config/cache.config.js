"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRedisDb = withRedisDb;
const config_1 = require("@nestjs/config");
function withRedisDb(url, db) {
    const parsed = new URL(url);
    parsed.pathname = `/${db}`;
    return parsed.toString();
}
exports.default = (0, config_1.registerAs)('cache', () => {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const cacheDb = process.env.REDIS_CACHE_DB ? parseInt(process.env.REDIS_CACHE_DB, 10) : 1;
    const streamsDb = process.env.REDIS_STREAMS_DB
        ? parseInt(process.env.REDIS_STREAMS_DB, 10)
        : 0;
    return {
        redisUrl,
        cacheUrl: withRedisDb(redisUrl, cacheDb),
        streamsUrl: withRedisDb(redisUrl, streamsDb),
        redisHost: process.env.REDIS_HOST ?? 'localhost',
        redisPort: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
        redisPassword: process.env.REDIS_PASSWORD,
        ttlSeconds: process.env.CACHE_TTL_SECONDS
            ? parseInt(process.env.CACHE_TTL_SECONDS, 10)
            : 60,
        rateLimit: {
            windowSeconds: process.env.RATE_LIMIT_WINDOW_SECONDS
                ? parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 10)
                : 60,
            maxRequests: process.env.RATE_LIMIT_MAX_REQUESTS
                ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10)
                : 100,
        },
        geofencing: {
            ttlSeconds: process.env.GEOFENCING_CACHE_TTL_SECONDS
                ? parseInt(process.env.GEOFENCING_CACHE_TTL_SECONDS, 10)
                : 60,
            gridPrecision: 3,
        },
    };
});
//# sourceMappingURL=cache.config.js.map