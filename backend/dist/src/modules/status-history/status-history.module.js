"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusHistoryModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const incident_entity_1 = require("../../entities/incident.entity");
const status_history_entity_1 = require("../../entities/status-history.entity");
const status_history_controller_1 = require("./status-history.controller");
const status_history_repository_1 = require("./status-history.repository");
const status_history_service_1 = require("./status-history.service");
let StatusHistoryModule = class StatusHistoryModule {
};
exports.StatusHistoryModule = StatusHistoryModule;
exports.StatusHistoryModule = StatusHistoryModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([status_history_entity_1.StatusHistoryEntity, incident_entity_1.IncidentEntity])],
        controllers: [status_history_controller_1.StatusHistoryController],
        providers: [status_history_service_1.StatusHistoryService, status_history_repository_1.StatusHistoryRepository],
    })
], StatusHistoryModule);
//# sourceMappingURL=status-history.module.js.map