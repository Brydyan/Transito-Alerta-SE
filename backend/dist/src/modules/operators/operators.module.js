"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperatorsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const incident_entity_1 = require("../../entities/incident.entity");
const incident_category_entity_1 = require("../../entities/incident-category.entity");
const operators_controller_1 = require("./operators.controller");
const operator_location_service_1 = require("./operator-location.service");
const operator_dashboard_service_1 = require("./operator-dashboard.service");
let OperatorsModule = class OperatorsModule {
};
exports.OperatorsModule = OperatorsModule;
exports.OperatorsModule = OperatorsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([incident_entity_1.IncidentEntity, incident_category_entity_1.IncidentCategoryEntity])],
        controllers: [operators_controller_1.OperatorsController],
        providers: [operator_location_service_1.OperatorLocationService, operator_dashboard_service_1.OperatorDashboardService],
    })
], OperatorsModule);
//# sourceMappingURL=operators.module.js.map