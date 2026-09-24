"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const geofencing_module_1 = require("../geofencing/geofencing.module");
const organizations_module_1 = require("../organizations/organizations.module");
const audit_module_1 = require("../audit/audit.module");
const organization_entity_1 = require("../../entities/organization.entity");
const incident_image_entity_1 = require("../../entities/incident-image.entity");
const user_entity_1 = require("../../entities/user.entity");
const incident_reporters_entity_1 = require("../../entities/incident-reporters.entity");
const incidents_controller_1 = require("./incidents.controller");
const incidents_repository_1 = require("./incidents.repository");
const incidents_service_1 = require("./incidents.service");
const incident_workflow_controller_1 = require("./incident-workflow.controller");
const incident_workflow_service_1 = require("./incident-workflow.service");
const incident_analytics_service_1 = require("./incident-analytics.service");
const incident_feed_service_1 = require("./incident-feed.service");
const incident_export_service_1 = require("./incident-export.service");
const incident_images_controller_1 = require("./incident-images.controller");
const incident_images_service_1 = require("./incident-images.service");
const incident_image_storage_service_1 = require("./incident-image-storage.service");
const feed_recovery_service_1 = require("./feed-recovery.service");
const reveal_service_1 = require("./reveal.service");
let IncidentsModule = class IncidentsModule {
};
exports.IncidentsModule = IncidentsModule;
exports.IncidentsModule = IncidentsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            geofencing_module_1.GeofencingModule,
            organizations_module_1.OrganizationsModule,
            audit_module_1.AuditModule,
            typeorm_1.TypeOrmModule.forFeature([
                organization_entity_1.OrganizationEntity,
                incident_image_entity_1.IncidentImageEntity,
                user_entity_1.UserEntity,
                incident_reporters_entity_1.IncidentReporterEntity,
            ]),
        ],
        controllers: [incident_workflow_controller_1.IncidentWorkflowController, incidents_controller_1.IncidentsController, incident_images_controller_1.IncidentImagesController],
        providers: [incidents_repository_1.IncidentsRepository, incidents_service_1.IncidentsService, incident_workflow_service_1.IncidentWorkflowService, incident_analytics_service_1.IncidentAnalyticsService, incident_feed_service_1.IncidentFeedService, incident_export_service_1.IncidentExportService, incident_images_service_1.IncidentImagesService, incident_image_storage_service_1.IncidentImageStorageService, feed_recovery_service_1.FeedRecoveryService, reveal_service_1.RevealService],
        exports: [incidents_service_1.IncidentsService, incidents_repository_1.IncidentsRepository],
    })
], IncidentsModule);
//# sourceMappingURL=incidents.module.js.map