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
exports.RoomAuthorizer = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const room_util_1 = require("./room.util");
let RoomAuthorizer = class RoomAuthorizer {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async authorize(ctx, room) {
        if (room.startsWith('geo:')) {
            const zoneId = room.slice('geo:'.length);
            const ownerOrgId = await this.findOrgIdForZone(zoneId);
            return (0, room_util_1.canJoinRoom)(ctx, room, ownerOrgId);
        }
        if (room.startsWith('incident:')) {
            const incidentId = room.slice('incident:'.length);
            const ownerOrgId = await this.findOrgIdForIncident(incidentId);
            return (0, room_util_1.canJoinRoom)(ctx, room, ownerOrgId);
        }
        return (0, room_util_1.canJoinRoom)(ctx, room);
    }
    async findOrgIdForZone(zoneId) {
        const rows = await this.dataSource.query(`SELECT id FROM organizations WHERE zone_id = $1`, [zoneId]);
        return rows[0]?.id ?? null;
    }
    async findOrgIdForIncident(incidentId) {
        const rows = await this.dataSource.query(`SELECT organization_id FROM incidents WHERE id = $1`, [incidentId]);
        return rows[0]?.organization_id ?? null;
    }
};
exports.RoomAuthorizer = RoomAuthorizer;
exports.RoomAuthorizer = RoomAuthorizer = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], RoomAuthorizer);
//# sourceMappingURL=room-authorizer.service.js.map