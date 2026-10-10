import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Reflector } from '@nestjs/core';
import type { Cache } from 'cache-manager';
import { from, Observable, of, switchMap, tap } from 'rxjs';

export const CACHEABLE_KEY = 'atl:cacheable';

export interface CacheableOptions {
  ttlSeconds: number;
}

/**
 * Opt-in response caching decorator.
 * Usage: `@Cacheable({ ttlSeconds: 30 })` on a controller route handler.
 */
export const Cacheable = (options: CacheableOptions): MethodDecorator =>
  SetMetadata(CACHEABLE_KEY, options);

/**
 * ResponseCacheInterceptor — caches full JSON responses for routes
 * decorated with @Cacheable. Cache key is derived from the request path
 * (query-string included) so distinct queries don't collide.
 */
@Injectable()
export class ResponseCacheInterceptor implements NestInterceptor {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<CacheableOptions | undefined>(
      CACHEABLE_KEY,
      context.getHandler(),
    );

    if (!options) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const key = `atl:cache:${request.method}:${request.path}`;

    return from(this.cache.get(key)).pipe(
      switchMap((cached) => {
        if (cached !== undefined && cached !== null) {
          return of(cached);
        }
        return next.handle().pipe(
          tap((response) => {
            void this.cache.set(key, response, options.ttlSeconds * 1000);
          }),
        );
      }),
    );
  }
}
