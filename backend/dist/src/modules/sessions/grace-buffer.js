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
var GraceBuffer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraceBuffer = void 0;
const common_1 = require("@nestjs/common");
const core_module_1 = require("../../core/core.module");
function graceKey(sid, tokenHash) {
    return `sess:grace:${sid}:${tokenHash}`;
}
let GraceBuffer = GraceBuffer_1 = class GraceBuffer {
    constructor(redis) {
        this.redis = redis;
        this.logger = new common_1.Logger(GraceBuffer_1.name);
    }
    async set(sid, retiringTokenHash, pair, ttlSeconds, previousTokenHash) {
        if (ttlSeconds <= 0) {
            return;
        }
        try {
            const pipeline = this.redis.pipeline();
            pipeline.setex(graceKey(sid, retiringTokenHash), Math.ceil(ttlSeconds), JSON.stringify(pair));
            if (previousTokenHash !== null) {
                pipeline.del(graceKey(sid, previousTokenHash));
            }
            await pipeline.exec();
        }
        catch (err) {
            this.logger.error(`GraceBuffer.set failed: ${err.message}`);
        }
    }
    async get(sid, presentedTokenHash) {
        try {
            const value = await this.redis.get(graceKey(sid, presentedTokenHash));
            if (value === null) {
                return null;
            }
            return JSON.parse(value);
        }
        catch (err) {
            this.logger.warn(`GraceBuffer.get failed (treated as a miss): ${err.message}`);
            return null;
        }
    }
    async clear(sid, tokenHash) {
        try {
            await this.redis.del(graceKey(sid, tokenHash));
        }
        catch (err) {
            this.logger.warn(`GraceBuffer.clear failed: ${err.message}`);
        }
    }
};
exports.GraceBuffer = GraceBuffer;
exports.GraceBuffer = GraceBuffer = GraceBuffer_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(core_module_1.SESSION_REDIS_CLIENT)),
    __metadata("design:paramtypes", [Function])
], GraceBuffer);
//# sourceMappingURL=grace-buffer.js.map