"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentSocialModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const incident_follower_entity_1 = require("./entities/incident-follower.entity");
const incident_corroboration_entity_1 = require("./entities/incident-corroboration.entity");
const incident_social_service_1 = require("./incident-social.service");
const incident_social_controller_1 = require("./incident-social.controller");
const incidents_module_1 = require("../incidents/incidents.module");
let IncidentSocialModule = class IncidentSocialModule {
};
exports.IncidentSocialModule = IncidentSocialModule;
exports.IncidentSocialModule = IncidentSocialModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([incident_follower_entity_1.IncidentFollower, incident_corroboration_entity_1.IncidentCorroboration]),
            incidents_module_1.IncidentsModule
        ],
        providers: [incident_social_service_1.IncidentSocialService],
        controllers: [incident_social_controller_1.IncidentSocialController],
        exports: [incident_social_service_1.IncidentSocialService]
    })
], IncidentSocialModule);
//# sourceMappingURL=incident-social.module.js.map