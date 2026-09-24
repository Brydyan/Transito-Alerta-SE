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
exports.OperatorLocationService = void 0;
const common_1 = require("@nestjs/common");
const core_module_1 = require("../../core/core.module");
let OperatorLocationService = class OperatorLocationService {
    constructor(redis) {
        this.redis = redis;
    }
    async record(userId, orgId, lat, lng) {
        const value = JSON.stringify({
            userId,
            organizationId: orgId,
            lat,
            lng,
            updatedAt: new Date().toISOString(),
        });
        await this.redis.hset(`operators:loc:${orgId}`, userId, value);
        await this.redis.expire(`operators:loc:${orgId}`, 300);
    }
    async activeFor(orgId, isSystemAdmin) {
        if (isSystemAdmin) {
            const keys = await this.redis.keys('operators:loc:*');
            const all = [];
            for (const key of keys) {
                const raw = await this.redis.hgetall(key);
                all.push(...Object.values(raw ?? {}).map((v) => JSON.parse(v)));
            }
            return all;
        }
        if (!orgId)
            return [];
        const raw = await this.redis.hgetall(`operators:loc:${orgId}`);
        return Object.values(raw ?? {}).map((v) => JSON.parse(v));
    }
};
exports.OperatorLocationService = OperatorLocationService;
exports.OperatorLocationService = OperatorLocationService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(core_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [Function])
], OperatorLocationService);
//# sourceMappingURL=operator-location.service.js.map