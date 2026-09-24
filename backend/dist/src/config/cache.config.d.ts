export interface CacheConfig {
    redisUrl: string;
    cacheUrl: string;
    streamsUrl: string;
    redisHost: string;
    redisPort: number;
    redisPassword?: string;
    ttlSeconds: number;
    rateLimit: {
        windowSeconds: number;
        maxRequests: number;
    };
    geofencing: {
        ttlSeconds: number;
        gridPrecision: number;
    };
}
export declare function withRedisDb(url: string, db: number): string;
declare const _default: (() => CacheConfig) & import("@nestjs/config").ConfigFactoryKeyHost<CacheConfig>;
export default _default;
