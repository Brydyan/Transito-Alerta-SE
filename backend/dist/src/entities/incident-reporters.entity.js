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
exports.IncidentReporterEntity = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const incident_entity_1 = require("./incident.entity");
let IncidentReporterEntity = class IncidentReporterEntity {
};
exports.IncidentReporterEntity = IncidentReporterEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ name: 'incident_id', type: 'uuid' }),
    __metadata("design:type", String)
], IncidentReporterEntity.prototype, "incidentId", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => incident_entity_1.IncidentEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'incident_id' }),
    __metadata("design:type", incident_entity_1.IncidentEntity)
], IncidentReporterEntity.prototype, "incident", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.UserEntity, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.UserEntity)
], IncidentReporterEntity.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    __metadata("design:type", String)
], IncidentReporterEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], IncidentReporterEntity.prototype, "createdAt", void 0);
exports.IncidentReporterEntity = IncidentReporterEntity = __decorate([
    (0, typeorm_1.Entity)('incident_reporters'),
    (0, typeorm_1.Index)('idx_incident_reporters_user', ['userId', 'createdAt'])
], IncidentReporterEntity);
//# sourceMappingURL=incident-reporters.entity.js.map