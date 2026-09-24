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
exports.IncidentImageStorageService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let IncidentImageStorageService = class IncidentImageStorageService {
    constructor() { }
    async upload(incidentId, file) {
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `incidents/${incidentId}/${(0, crypto_1.randomUUID)()}-${sanitized}`;
        return { key, url: this.getSignedUrl(key) };
    }
    getSignedUrl(key) {
        const signature = (0, crypto_1.createHash)('sha256').update(key).digest('hex').slice(0, 16);
        return `https://storage.example.com/${key}?sig=${signature}`;
    }
    async delete(_key) {
    }
};
exports.IncidentImageStorageService = IncidentImageStorageService;
exports.IncidentImageStorageService = IncidentImageStorageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], IncidentImageStorageService);
//# sourceMappingURL=incident-image-storage.service.js.map