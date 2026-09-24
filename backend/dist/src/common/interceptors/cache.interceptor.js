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
exports.ResponseCacheInterceptor = exports.Cacheable = exports.CACHEABLE_KEY = void 0;
const common_1 = require("@nestjs/common");
const cache_manager_1 = require("@nestjs/cache-manager");
const core_1 = require("@nestjs/core");
const rxjs_1 = require("rxjs");
exports.CACHEABLE_KEY = 'atl:cacheable';
const Cacheable = (options) => (0, common_1.SetMetadata)(exports.CACHEABLE_KEY, options);
exports.Cacheable = Cacheable;
let ResponseCacheInterceptor = class ResponseCacheInterceptor {
    constructor(cache, reflector) {
        this.cache = cache;
        this.reflector = reflector;
    }
    intercept(context, next) {
        const options = this.reflector.get(exports.CACHEABLE_KEY, context.getHandler());
        if (!options) {
            return next.handle();
        }
        const request = context.switchToHttp().getRequest();
        const key = `atl:cache:${request.method}:${request.path}`;
        return (0, rxjs_1.from)(this.cache.get(key)).pipe((0, rxjs_1.switchMap)((cached) => {
            if (cached !== undefined && cached !== null) {
                return (0, rxjs_1.of)(cached);
            }
            return next.handle().pipe((0, rxjs_1.tap)((response) => {
                void this.cache.set(key, response, options.ttlSeconds * 1000);
            }));
        }));
    }
};
exports.ResponseCacheInterceptor = ResponseCacheInterceptor;
exports.ResponseCacheInterceptor = ResponseCacheInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [Object, core_1.Reflector])
], ResponseCacheInterceptor);
//# sourceMappingURL=cache.interceptor.js.map