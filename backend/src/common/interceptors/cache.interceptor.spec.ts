import { of } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CACHEABLE_KEY, ResponseCacheInterceptor } from './cache.interceptor';

function makeContext(path: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ path, method: 'GET' }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('ResponseCacheInterceptor', () => {
  let cacheManager: { get: jest.Mock; set: jest.Mock };
  let reflector: Reflector;

  beforeEach(() => {
    cacheManager = { get: jest.fn(), set: jest.fn() };
    reflector = new Reflector();
  });

  it('passes through to the handler (no cache hit) when no @Cacheable metadata is set', (done) => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const interceptor = new ResponseCacheInterceptor(cacheManager as any, reflector);
    const next: CallHandler = { handle: () => of({ value: 'fresh' }) };

    interceptor.intercept(makeContext('/api/incidents'), next).subscribe((result) => {
      expect(result).toEqual({ value: 'fresh' });
      expect(cacheManager.get).not.toHaveBeenCalled();
      done();
    });
  });

  it('returns the cached value directly when a cache hit exists for a @Cacheable route', (done) => {
    jest.spyOn(reflector, 'get').mockReturnValue({ ttlSeconds: 30 });
    cacheManager.get.mockResolvedValue({ value: 'cached' });
    const interceptor = new ResponseCacheInterceptor(cacheManager as any, reflector);
    const next: CallHandler = { handle: () => of({ value: 'fresh' }) };

    interceptor.intercept(makeContext('/api/incidents'), next).subscribe((result) => {
      expect(result).toEqual({ value: 'cached' });
      done();
    });
  });

  it('stores the fresh handler response in cache on a miss, using the configured ttl', (done) => {
    jest.spyOn(reflector, 'get').mockReturnValue({ ttlSeconds: 30 });
    cacheManager.get.mockResolvedValue(undefined);
    const interceptor = new ResponseCacheInterceptor(cacheManager as any, reflector);
    const next: CallHandler = { handle: () => of({ value: 'fresh' }) };

    interceptor.intercept(makeContext('/api/incidents'), next).subscribe((result) => {
      expect(result).toEqual({ value: 'fresh' });
      expect(cacheManager.set).toHaveBeenCalledWith(
        expect.any(String),
        { value: 'fresh' },
        30000,
      );
      done();
    });
  });
});

describe('CACHEABLE_KEY', () => {
  it('is a stable, non-empty metadata key string', () => {
    expect(typeof CACHEABLE_KEY).toBe('string');
    expect(CACHEABLE_KEY.length).toBeGreaterThan(0);
  });
});
