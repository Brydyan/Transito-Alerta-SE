"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeofencingModule = void 0;
const common_1 = require("@nestjs/common");
const geofencing_repository_1 = require("./geofencing.repository");
const geofencing_service_1 = require("./geofencing.service");
let GeofencingModule = class GeofencingModule {
};
exports.GeofencingModule = GeofencingModule;
exports.GeofencingModule = GeofencingModule = __decorate([
    (0, common_1.Module)({
        providers: [geofencing_repository_1.GeofencingRepository, geofencing_service_1.GeofencingService],
        exports: [geofencing_service_1.GeofencingService],
    })
], GeofencingModule);
//# sourceMappingURL=geofencing.module.js.map