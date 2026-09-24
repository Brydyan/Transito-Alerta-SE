import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Cache } from 'cache-manager';
export declare function buildRateLimitKey(identity: string, route: string, nowMs?: number): string;
export declare class RateLimiterGuard implements CanActivate {
    private readonly cache;
    private readonly configService;
    private readonly jwtService;
    constructor(cache: Cache, configService: ConfigService, jwtService: JwtService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private resolveIdentity;
    private userIdFromToken;
}
