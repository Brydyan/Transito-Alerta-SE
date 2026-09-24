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
exports.GeofencingService = exports.POINT_CACHE_TAG_KEY = exports.ALL_ZONES_TAG = exports.GEO_CACHE_TTL_SECONDS = void 0;
const common_1 = require("@nestjs/common");
const cache_manager_1 = require("@nestjs/cache-manager");
const core_module_1 = require("../../core/core.module");
const geofencing_repository_1 = require("./geofencing.repository");
exports.GEO_CACHE_TTL_SECONDS = 60;
exports.ALL_ZONES_TAG = '__all_zones__';
exports.POINT_CACHE_TAG_KEY = 'geo:tags:points';
let GeofencingService = class GeofencingService {
    constructor(geofencingRepository, cache, redis) {
        this.geofencingRepository = geofencingRepository;
        this.cache = cache;
        this.redis = redis;
    }
    async resolveZone(point) {
        const zone = await this.validateIncidentInZone(point);
        return { zone_id: zone?.id ?? null, zone };
    }
    async validateIncidentInZone(point) {
        const { lat, lng } = point;
        if (typeof lat !== 'number' ||
            typeof lng !== 'number' ||
            Number.isNaN(lat) ||
            Number.isNaN(lng) ||
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180) {
            throw new common_1.BadRequestException('Invalid coordinates');
        }
        return this.getCachedZoneByPoint(lat, lng);
    }
    async getCachedZoneByPoint(lat, lng) {
        const key = this.buildCacheKey(lat, lng);
        const cached = await this.cache.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const zone = await this.geofencingRepository.findZoneByPoint(lat, lng);
        if (zone !== null) {
            await this.cache.set(key, zone, exports.GEO_CACHE_TTL_SECONDS * 1000);
            await this.tagPointCacheKey(key);
        }
        return zone;
    }
    buildCacheKey(lat, lng) {
        return `geo:point:${lat.toFixed(3)}:${lng.toFixed(3)}`;
    }
    buildZoneCacheKey(params) {
        const { zoneId, lat, lng, radiusKm, status } = params;
        return `geo:${zoneId}:${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusKm}:${status}`;
    }
    async tagCacheKey(zoneId, cacheKey) {
        await this.redis.sadd(`geo:tags:${zoneId}`, cacheKey);
    }
    async purgeZoneCache(zoneId) {
        if (!zoneId) {
            return;
        }
        const tagKey = `geo:tags:${zoneId}`;
        const keys = await this.redis.smembers(tagKey);
        await Promise.all(keys.map((key) => this.cache.del(key)));
        await this.redis.del(tagKey);
    }
    async tagPointCacheKey(cacheKey) {
        await this.redis.sadd(exports.POINT_CACHE_TAG_KEY, cacheKey);
    }
    async purgePointCache() {
        const keys = await this.redis.smembers(exports.POINT_CACHE_TAG_KEY);
        await Promise.all(keys.map((key) => this.cache.del(key)));
        await this.redis.del(exports.POINT_CACHE_TAG_KEY);
    }
};
exports.GeofencingService = GeofencingService;
exports.GeofencingService = GeofencingService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __param(2, (0, common_1.Inject)(core_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [geofencing_repository_1.GeofencingRepository, Object, Function])
], GeofencingService);
//# sourceMappingURL=geofencing.service.js.map