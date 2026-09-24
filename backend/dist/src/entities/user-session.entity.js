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
exports.UserSessionEntity = void 0;
const typeorm_1 = require("typeorm");
let UserSessionEntity = class UserSessionEntity {
    isValid(now) {
        return (this.revokedAt === null &&
            this.expiresAt !== null &&
            this.expiresAt.getTime() > now.getTime() &&
            this.refreshTokenHash !== null);
    }
};
exports.UserSessionEntity = UserSessionEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], UserSessionEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    __metadata("design:type", String)
], UserSessionEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'device_uuid', type: 'varchar', nullable: true }),
    __metadata("design:type", Object)
], UserSessionEntity.prototype, "deviceUuid", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], UserSessionEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'refresh_token_hash', type: 'char', length: 64, nullable: true }),
    __metadata("design:type", Object)
], UserSessionEntity.prototype, "refreshTokenHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'previous_refresh_token_hash', type: 'char', length: 64, nullable: true }),
    __metadata("design:type", Object)
], UserSessionEntity.prototype, "previousRefreshTokenHash", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'rotated_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], UserSessionEntity.prototype, "rotatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ip_address', type: 'varchar', length: 45, nullable: true }),
    __metadata("design:type", Object)
], UserSessionEntity.prototype, "ipAddress", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_agent', type: 'varchar', length: 512, nullable: true }),
    __metadata("design:type", Object)
], UserSessionEntity.prototype, "userAgent", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'revoked_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], UserSessionEntity.prototype, "revokedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_used_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], UserSessionEntity.prototype, "lastUsedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expires_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], UserSessionEntity.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null }),
    __metadata("design:type", Object)
], UserSessionEntity.prototype, "deletedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'updated_at', type: 'timestamptz', update: false }),
    __metadata("design:type", Date)
], UserSessionEntity.prototype, "updatedAt", void 0);
exports.UserSessionEntity = UserSessionEntity = __decorate([
    (0, typeorm_1.Entity)('user_sessions')
], UserSessionEntity);
//# sourceMappingURL=user-session.entity.js.map