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
exports.AuditEventEntity = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
let AuditEventEntity = class AuditEventEntity {
};
exports.AuditEventEntity = AuditEventEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], AuditEventEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.UserEntity, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'actor_id' }),
    __metadata("design:type", user_entity_1.UserEntity)
], AuditEventEntity.prototype, "actor", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'actor_id', type: 'uuid' }),
    __metadata("design:type", String)
], AuditEventEntity.prototype, "actorId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 64 }),
    __metadata("design:type", String)
], AuditEventEntity.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'resource_type', type: 'varchar', length: 64 }),
    __metadata("design:type", String)
], AuditEventEntity.prototype, "resourceType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'resource_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], AuditEventEntity.prototype, "resourceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], AuditEventEntity.prototype, "justification", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', default: () => "'{}'::jsonb" }),
    __metadata("design:type", Object)
], AuditEventEntity.prototype, "metadata", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], AuditEventEntity.prototype, "createdAt", void 0);
exports.AuditEventEntity = AuditEventEntity = __decorate([
    (0, typeorm_1.Entity)('audit_events'),
    (0, typeorm_1.Index)('idx_audit_resource', ['resourceType', 'resourceId', 'createdAt']),
    (0, typeorm_1.Index)('idx_audit_actor', ['actorId', 'createdAt'])
], AuditEventEntity);
//# sourceMappingURL=audit-event.entity.js.map