"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoZonesModule = void 0;
const common_1 = require("@nestjs/common");
const geofencing_module_1 = require("../geofencing/geofencing.module");
const geo_zones_controller_1 = require("./geo-zones.controller");
const geo_zones_repository_1 = require("./geo-zones.repository");
const geo_zones_service_1 = require("./geo-zones.service");
let GeoZonesModule = class GeoZonesModule {
};
exports.GeoZonesModule = GeoZonesModule;
exports.GeoZonesModule = GeoZonesModule = __decorate([
    (0, common_1.Module)({
        imports: [geofencing_module_1.GeofencingModule],
        controllers: [geo_zones_controller_1.GeoZonesController],
        providers: [geo_zones_service_1.GeoZonesService, geo_zones_repository_1.GeoZonesRepository],
        exports: [geo_zones_service_1.GeoZonesService],
    })
], GeoZonesModule);
//# sourceMappingURL=geo-zones.module.js.map