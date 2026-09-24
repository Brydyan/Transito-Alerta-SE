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
exports.IncidentEntity = void 0;
const typeorm_1 = require("typeorm");
let IncidentEntity = class IncidentEntity {
};
exports.IncidentEntity = IncidentEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], IncidentEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar' }),
    __metadata("design:type", String)
], IncidentEntity.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 }),
    __metadata("design:type", String)
], IncidentEntity.prototype, "location", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', default: 'pending' }),
    __metadata("design:type", String)
], IncidentEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', default: 'medium' }),
    __metadata("design:type", String)
], IncidentEntity.prototype, "priority", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'citizen_id', type: 'uuid' }),
    __metadata("design:type", String)
], IncidentEntity.prototype, "citizenId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_anonymous', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], IncidentEntity.prototype, "isAnonymous", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'assigned_to', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "assignedTo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'zone_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "zoneId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'geofence_matched', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], IncidentEntity.prototype, "geofenceMatched", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'category_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "categoryId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'organization_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "organizationId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'claimed_by', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "claimedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'claimed_at', type: 'timestamptz', nullable: true, default: null }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "claimedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'resolution_date', type: 'timestamptz', nullable: true, default: null }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "resolutionDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'approved_by', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "approvedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'approved_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "approvedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'rejected_by', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "rejectedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'rejected_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "rejectedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'rejection_reason', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "rejectionReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'deleted_at', type: 'timestamptz', nullable: true, default: null }),
    __metadata("design:type", Object)
], IncidentEntity.prototype, "deletedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], IncidentEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'updated_at', type: 'timestamptz', update: false }),
    __metadata("design:type", Date)
], IncidentEntity.prototype, "updatedAt", void 0);
exports.IncidentEntity = IncidentEntity = __decorate([
    (0, typeorm_1.Entity)('incidents')
], IncidentEntity);
//# sourceMappingURL=incident.entity.js.map