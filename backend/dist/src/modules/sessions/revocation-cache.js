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
var RevocationCache_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevocationCache = void 0;
const common_1 = require("@nestjs/common");
const core_module_1 = require("../../core/core.module");
function revokedKey(sid) {
    return `sess:revoked:${sid}`;
}
let RevocationCache = RevocationCache_1 = class RevocationCache {
    constructor(redis) {
        this.redis = redis;
        this.logger = new common_1.Logger(RevocationCache_1.name);
    }
    async isRevoked(sid) {
        try {
            const value = await this.redis.get(revokedKey(sid));
            return value !== null;
        }
        catch (err) {
            this.logger.warn(`RevocationCache.isRevoked fail-open on error: ${err.message}`);
            return false;
        }
    }
    async revoke(sid, ttlSeconds) {
        const safeTtl = Math.max(1, Math.ceil(ttlSeconds));
        try {
            await this.redis.setex(revokedKey(sid), safeTtl, '1');
        }
        catch (err) {
            this.logger.error(`RevocationCache.revoke failed to write denylist entry: ${err.message}`);
        }
    }
};
exports.RevocationCache = RevocationCache;
exports.RevocationCache = RevocationCache = RevocationCache_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(core_module_1.SESSION_REDIS_CLIENT)),
    __metadata("design:paramtypes", [Function])
], RevocationCache);
//# sourceMappingURL=revocation-cache.js.map