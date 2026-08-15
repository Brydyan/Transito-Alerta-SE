import { registerAs } from '@nestjs/config';

export interface CacheConfig {
  redisUrl: string;
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

/**
 * Redis / cache configuration.
 *
 * DB 0 = Streams/sessions, DB 1 = cache (design "Scale Patterns" table).
 */
export default registerAs(
  'cache',
  (): CacheConfig => ({
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
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
      gridPrecision: 3, // ~110m grid (lat3/lng3), per design D4
    },
  }),
);
