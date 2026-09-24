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
exports.IncidentImageEntity = void 0;
const typeorm_1 = require("typeorm");
let IncidentImageEntity = class IncidentImageEntity {
};
exports.IncidentImageEntity = IncidentImageEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], IncidentImageEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'incident_id', type: 'uuid' }),
    __metadata("design:type", String)
], IncidentImageEntity.prototype, "incidentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'storage_key', type: 'text' }),
    __metadata("design:type", String)
], IncidentImageEntity.prototype, "storageKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], IncidentImageEntity.prototype, "url", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'mime_type', type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], IncidentImageEntity.prototype, "mimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'file_size', type: 'bigint' }),
    __metadata("design:type", Number)
], IncidentImageEntity.prototype, "fileSize", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], IncidentImageEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'updated_at', type: 'timestamptz', update: false }),
    __metadata("design:type", Date)
], IncidentImageEntity.prototype, "updatedAt", void 0);
exports.IncidentImageEntity = IncidentImageEntity = __decorate([
    (0, typeorm_1.Entity)('incident_images')
], IncidentImageEntity);
//# sourceMappingURL=incident-image.entity.js.map