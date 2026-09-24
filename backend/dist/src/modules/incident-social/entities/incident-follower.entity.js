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
exports.IncidentFollower = void 0;
const typeorm_1 = require("typeorm");
const incident_entity_1 = require("../../../entities/incident.entity");
const user_entity_1 = require("../../../entities/user.entity");
let IncidentFollower = class IncidentFollower {
};
exports.IncidentFollower = IncidentFollower;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], IncidentFollower.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => incident_entity_1.IncidentEntity, { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'incident_id' }),
    __metadata("design:type", incident_entity_1.IncidentEntity)
], IncidentFollower.prototype, "incident", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.UserEntity, { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", user_entity_1.UserEntity)
], IncidentFollower.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], IncidentFollower.prototype, "createdAt", void 0);
exports.IncidentFollower = IncidentFollower = __decorate([
    (0, typeorm_1.Entity)('incident_followers'),
    (0, typeorm_1.Unique)(['incident', 'user'])
], IncidentFollower);
//# sourceMappingURL=incident-follower.entity.js.map