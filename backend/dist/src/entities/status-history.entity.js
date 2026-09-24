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
exports.StatusHistoryEntity = void 0;
const typeorm_1 = require("typeorm");
let StatusHistoryEntity = class StatusHistoryEntity {
};
exports.StatusHistoryEntity = StatusHistoryEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], StatusHistoryEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'incident_id', type: 'uuid' }),
    __metadata("design:type", String)
], StatusHistoryEntity.prototype, "incidentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'changed_by_user_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], StatusHistoryEntity.prototype, "changedByUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'previous_status', type: 'varchar' }),
    __metadata("design:type", String)
], StatusHistoryEntity.prototype, "previousStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'new_status', type: 'varchar' }),
    __metadata("design:type", String)
], StatusHistoryEntity.prototype, "newStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'event_id', type: 'varchar' }),
    __metadata("design:type", String)
], StatusHistoryEntity.prototype, "eventId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], StatusHistoryEntity.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], StatusHistoryEntity.prototype, "createdAt", void 0);
exports.StatusHistoryEntity = StatusHistoryEntity = __decorate([
    (0, typeorm_1.Entity)('status_history')
], StatusHistoryEntity);
//# sourceMappingURL=status-history.entity.js.map