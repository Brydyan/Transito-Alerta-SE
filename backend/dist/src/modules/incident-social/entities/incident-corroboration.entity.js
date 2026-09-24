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
exports.IncidentCorroboration = void 0;
const typeorm_1 = require("typeorm");
const incident_entity_1 = require("../../../entities/incident.entity");
const user_entity_1 = require("../../../entities/user.entity");
let IncidentCorroboration = class IncidentCorroboration {
};
exports.IncidentCorroboration = IncidentCorroboration;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], IncidentCorroboration.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => incident_entity_1.IncidentEntity, { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'incident_id' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", incident_entity_1.IncidentEntity)
], IncidentCorroboration.prototype, "incident", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.UserEntity, { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.UserEntity)
], IncidentCorroboration.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], IncidentCorroboration.prototype, "comment", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], IncidentCorroboration.prototype, "createdAt", void 0);
exports.IncidentCorroboration = IncidentCorroboration = __decorate([
    (0, typeorm_1.Entity)('incident_corroborations'),
    (0, typeorm_1.Unique)(['incident', 'user'])
], IncidentCorroboration);
//# sourceMappingURL=incident-corroboration.entity.js.map