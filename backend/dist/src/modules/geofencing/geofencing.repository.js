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
exports.GeofencingRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
let GeofencingRepository = class GeofencingRepository {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async findZoneByPoint(lat, lng) {
        const rows = await this.dataSource.query(`SELECT id, name, active, created_at
       FROM geo_zones
       WHERE active = true
         AND polygon IS NOT NULL
         AND ST_Contains(polygon, ST_SetSRID(ST_Point($1, $2), 4326))
       LIMIT 1`, [lng, lat]);
        return rows[0] ?? null;
    }
    async findZonesNearby(lat, lng, radiusKm) {
        const radiusMeters = radiusKm * 1000;
        return this.dataSource.query(`SELECT id, name, active, created_at
       FROM geo_zones
       WHERE active = true
         AND polygon IS NOT NULL
         AND ST_DWithin(
           polygon::geography,
           ST_SetSRID(ST_Point($1, $2), 4326)::geography,
           $3
         )`, [lng, lat, radiusMeters]);
    }
};
exports.GeofencingRepository = GeofencingRepository;
exports.GeofencingRepository = GeofencingRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], GeofencingRepository);
//# sourceMappingURL=geofencing.repository.js.map