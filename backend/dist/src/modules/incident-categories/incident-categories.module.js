"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentCategoriesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const incident_category_entity_1 = require("../../entities/incident-category.entity");
const incident_categories_controller_1 = require("./incident-categories.controller");
const incident_categories_repository_1 = require("./incident-categories.repository");
const incident_categories_service_1 = require("./incident-categories.service");
let IncidentCategoriesModule = class IncidentCategoriesModule {
};
exports.IncidentCategoriesModule = IncidentCategoriesModule;
exports.IncidentCategoriesModule = IncidentCategoriesModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([incident_category_entity_1.IncidentCategoryEntity])],
        controllers: [incident_categories_controller_1.IncidentCategoriesController],
        providers: [incident_categories_service_1.IncidentCategoriesService, incident_categories_repository_1.IncidentCategoriesRepository],
        exports: [incident_categories_service_1.IncidentCategoriesService],
    })
], IncidentCategoriesModule);
//# sourceMappingURL=incident-categories.module.js.map