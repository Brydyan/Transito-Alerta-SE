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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentSocialService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const incident_follower_entity_1 = require("./entities/incident-follower.entity");
const incident_corroboration_entity_1 = require("./entities/incident-corroboration.entity");
const incidents_service_1 = require("../incidents/incidents.service");
let IncidentSocialService = class IncidentSocialService {
    constructor(followerRepo, corroborationRepo, incidentsService) {
        this.followerRepo = followerRepo;
        this.corroborationRepo = corroborationRepo;
        this.incidentsService = incidentsService;
    }
    async follow(incidentId, userId) {
        try {
            await this.followerRepo.save({ incident: { id: incidentId }, user: { id: userId } });
        }
        catch (e) {
            if (e.code !== '23505')
                throw e;
        }
    }
    async unfollow(incidentId, userId) {
        await this.followerRepo.delete({ incident: { id: incidentId }, user: { id: userId } });
    }
    async corroborate(incidentId, userId, comment) {
        const incident = await this.incidentsService.findOne(incidentId, { kind: 'global' });
        if (!incident)
            throw new common_1.NotFoundException('Incident not found');
        if (incident.citizen_id === userId) {
            throw new common_1.ConflictException('Author cannot corroborate own incident');
        }
        try {
            await this.corroborationRepo.save({
                incident: { id: incidentId },
                user: { id: userId },
                comment: comment || ''
            });
        }
        catch (e) {
            if (e.code === '23505')
                throw new common_1.ConflictException('Already corroborated');
            throw e;
        }
    }
};
exports.IncidentSocialService = IncidentSocialService;
exports.IncidentSocialService = IncidentSocialService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(incident_follower_entity_1.IncidentFollower)),
    __param(1, (0, typeorm_1.InjectRepository)(incident_corroboration_entity_1.IncidentCorroboration)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        incidents_service_1.IncidentsService])
], IncidentSocialService);
//# sourceMappingURL=incident-social.service.js.map