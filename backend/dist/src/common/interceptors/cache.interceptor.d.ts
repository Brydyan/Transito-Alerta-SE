import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Cache } from 'cache-manager';
import { Observable } from 'rxjs';
export declare const CACHEABLE_KEY = "atl:cacheable";
export interface CacheableOptions {
    ttlSeconds: number;
}
export declare const Cacheable: (options: CacheableOptions) => MethodDecorator;
export declare class ResponseCacheInterceptor implements NestInterceptor {
    private readonly cache;
    private readonly reflector;
    constructor(cache: Cache, reflector: Reflector);
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>;
}
