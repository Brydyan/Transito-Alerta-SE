import cacheConfig, { withRedisDb } from './cache.config';

describe('withRedisDb', () => {
  it('appends the database index to a bare URL', () => {
    expect(withRedisDb('redis://localhost:6379', 1)).toBe('redis://localhost:6379/1');
  });

  it('preserves credentials', () => {
    expect(withRedisDb('redis://:s3cret@redis.internal:6379', 1)).toBe(
      'redis://:s3cret@redis.internal:6379/1',
    );
  });

  it('preserves the TLS scheme used by managed providers', () => {
    expect(withRedisDb('rediss://:s3cret@managed.example.com:6380', 0)).toBe(
      'rediss://:s3cret@managed.example.com:6380/0',
    );
  });

  it('overrides a database index already present in the URL', () => {
    expect(withRedisDb('redis://localhost:6379/7', 1)).toBe('redis://localhost:6379/1');
  });
});

describe('cacheConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('isolates cache on DB 1 and Streams on DB 0 by default', () => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_CACHE_DB;
    delete process.env.REDIS_STREAMS_DB;

    const config = cacheConfig();

    expect(config.cacheUrl).toBe('redis://localhost:6379/1');
    expect(config.streamsUrl).toBe('redis://localhost:6379/0');
  });

  it('never points cache and Streams at the same database', () => {
    const config = cacheConfig();

    expect(config.cacheUrl).not.toBe(config.streamsUrl);
  });

  it('reads the rate limit variable names documented in .env.example', () => {
    process.env.RATE_LIMIT_MAX_REQUESTS = '250';
    process.env.RATE_LIMIT_WINDOW_SECONDS = '30';

    const config = cacheConfig();

    expect(config.rateLimit.maxRequests).toBe(250);
    expect(config.rateLimit.windowSeconds).toBe(30);
  });
});
