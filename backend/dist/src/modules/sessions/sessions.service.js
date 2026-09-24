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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionsService = void 0;
const common_1 = require("@nestjs/common");
const assert_can_manage_1 = require("../../common/authz/assert-can-manage");
const permission_guard_1 = require("../../common/guards/permission.guard");
const permission_lookup_service_1 = require("../../common/permissions/permission-lookup.service");
const session_response_dto_1 = require("./dto/session-response.dto");
const revocation_cache_1 = require("./revocation-cache");
const sessions_repository_1 = require("./sessions.repository");
let SessionsService = class SessionsService {
    constructor(sessionsRepository, revocationCache, permissionLookup) {
        this.sessionsRepository = sessionsRepository;
        this.revocationCache = revocationCache;
        this.permissionLookup = permissionLookup;
    }
    async listForSelf(actor) {
        const rows = await this.sessionsRepository.findActiveByUser(actor.userId);
        return rows.map((row) => (0, session_response_dto_1.toSessionResponseDto)(row, actor.sessionId));
    }
    async listForTarget(actor, targetUserId) {
        const target = await this.sessionsRepository.findManageableTarget(targetUserId);
        if (!target) {
            throw new common_1.NotFoundException('User not found');
        }
        (0, assert_can_manage_1.assertVisible)(actor, target);
        const rows = await this.sessionsRepository.findActiveByUser(targetUserId);
        return rows.map((row) => (0, session_response_dto_1.toSessionResponseDto)(row, actor.sessionId));
    }
    async revokeForActor(actor, sessionId) {
        const session = await this.sessionsRepository.findActiveById(sessionId);
        if (!session) {
            throw new common_1.NotFoundException('Session not found');
        }
        if (session.user_id !== actor.userId) {
            if (!(await (0, permission_guard_1.hasPermission)(actor.permissions, 'DELETE', 'sessions', this.permissionLookup))) {
                throw new common_1.ForbiddenException('Missing permission: DELETE sessions');
            }
            const target = await this.sessionsRepository.findManageableTarget(session.user_id);
            if (!target) {
                throw new common_1.NotFoundException('Session not found');
            }
            (0, assert_can_manage_1.assertCanManage)(actor, target);
        }
        const revoked = await this.sessionsRepository.revoke(sessionId);
        if (!revoked) {
            return;
        }
        const ttlSeconds = revoked.expires_at
            ? Math.max(1, Math.ceil((revoked.expires_at.getTime() - Date.now()) / 1000))
            : 1;
        await this.revocationCache.revoke(sessionId, ttlSeconds);
    }
};
exports.SessionsService = SessionsService;
exports.SessionsService = SessionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [sessions_repository_1.SessionsRepository,
        revocation_cache_1.RevocationCache,
        permission_lookup_service_1.PermissionLookupService])
], SessionsService);
//# sourceMappingURL=sessions.service.js.map