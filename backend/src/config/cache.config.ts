import { registerAs } from '@nestjs/config';

export interface CacheConfig {
  redisUrl: string;
  /** `redisUrl` pointing at the cache database (REDIS_CACHE_DB). */
  cacheUrl: string;
  /** `redisUrl` pointing at the Streams/sessions database (REDIS_STREAMS_DB). */
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

/**
 * Redis / cache configuration.
 *
 * DB 0 = Streams/sessions, DB 1 = cache (design "Scale Patterns" table).
 */
/**
 * Point a Redis URL at a specific logical database by rewriting its path.
 * Keeps credentials, host, port and TLS scheme intact.
 */
export function withRedisDb(url: string, db: number): string {
  const parsed = new URL(url);
  parsed.pathname = `/${db}`;
  return parsed.toString();
}

export default registerAs('cache', (): CacheConfig => {
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
      gridPrecision: 3, // ~110m grid (lat3/lng3), per design D4
    },
  };
});
