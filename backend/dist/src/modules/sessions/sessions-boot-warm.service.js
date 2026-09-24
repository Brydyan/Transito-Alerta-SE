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
var SessionsBootWarmService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionsBootWarmService = void 0;
const common_1 = require("@nestjs/common");
const core_module_1 = require("../../core/core.module");
const sessions_repository_1 = require("./sessions.repository");
let SessionsBootWarmService = SessionsBootWarmService_1 = class SessionsBootWarmService {
    constructor(sessionsRepository, redis) {
        this.sessionsRepository = sessionsRepository;
        this.redis = redis;
        this.logger = new common_1.Logger(SessionsBootWarmService_1.name);
    }
    async onApplicationBootstrap() {
        try {
            await this.redis.connect().catch(() => {
            });
            const rows = await this.sessionsRepository.findRevokedUnexpired();
            if (rows.length === 0) {
                return;
            }
            const now = Date.now();
            const pipeline = this.redis.pipeline();
            for (const row of rows) {
                const ttlSeconds = Math.max(1, Math.ceil((row.expires_at.getTime() - now) / 1000));
                pipeline.set(`sess:revoked:${row.id}`, '1', 'EX', ttlSeconds);
            }
            await pipeline.exec();
            this.logger.log(`Warmed ${rows.length} revoked session(s) into the denylist`);
        }
        catch (err) {
            this.logger.error(`Boot-warm of the session denylist failed: ${err.message}`);
        }
    }
};
exports.SessionsBootWarmService = SessionsBootWarmService;
exports.SessionsBootWarmService = SessionsBootWarmService = SessionsBootWarmService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(core_module_1.SESSION_REDIS_CLIENT)),
    __metadata("design:paramtypes", [sessions_repository_1.SessionsRepository, Function])
], SessionsBootWarmService);
//# sourceMappingURL=sessions-boot-warm.service.js.map