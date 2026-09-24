"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiterGuard = void 0;
exports.buildRateLimitKey = buildRateLimitKey;
const common_1 = require("@nestjs/common");
const cache_manager_1 = require("@nestjs/cache-manager");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
function buildRateLimitKey(identity, route, nowMs = Date.now()) {
    const minuteBucket = Math.floor(nowMs / 1000 / 60);
    return `rate-limit:${identity}:${route}:${minuteBucket}`;
}
let RateLimiterGuard = class RateLimiterGuard {
    constructor(cache, configService, jwtService) {
        this.cache = cache;
        this.configService = configService;
        this.jwtService = jwtService;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const identity = this.resolveIdentity(request);
        const route = request.path ?? request.url ?? 'unknown';
        const { rateLimit } = this.configService.get('cache');
        const key = buildRateLimitKey(identity, route);
        const current = (await this.cache.get(key)) ?? 0;
        if (current >= rateLimit.maxRequests) {
            throw new common_1.HttpException('Too Many Requests', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        await this.cache.set(key, current + 1, rateLimit.windowSeconds * 1000);
        return true;
    }
    resolveIdentity(request) {
        const userId = this.userIdFromToken(request.headers?.authorization);
        if (userId) {
            return `user:${userId}`;
        }
        return `ip:${request.ip ?? request.socket?.remoteAddress ?? 'unknown'}`;
    }
    userIdFromToken(authorization) {
        if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
            return null;
        }
        const { jwtAccessSecret } = this.configService.get('auth');
        try {
            const payload = this.jwtService.verify(authorization.slice('Bearer '.length), { secret: jwtAccessSecret });
            return payload.typ === 'access' ? (payload.sub ?? null) : null;
        }
        catch {
            return null;
        }
    }
};
exports.RateLimiterGuard = RateLimiterGuard;
exports.RateLimiterGuard = RateLimiterGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [Object, config_1.ConfigService,
        jwt_1.JwtService])
], RateLimiterGuard);
//# sourceMappingURL=rate-limiter.guard.js.map