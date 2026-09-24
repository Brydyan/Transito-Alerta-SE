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
var RoleRankAudit_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleRankAudit = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const role_entity_1 = require("../../entities/role.entity");
const role_rank_1 = require("./role-rank");
let RoleRankAudit = RoleRankAudit_1 = class RoleRankAudit {
    constructor(roleRepo) {
        this.roleRepo = roleRepo;
        this.logger = new common_1.Logger(RoleRankAudit_1.name);
    }
    async onApplicationBootstrap() {
        const roles = await this.roleRepo.find();
        const missing = roles.filter((role) => !(role.name in role_rank_1.ROLE_RANK)).map((role) => role.name);
        if (missing.length > 0) {
            this.logger.error(`Role(s) missing from ROLE_RANK (resolve to rank ∞ — can manage nobody): ${missing.join(', ')}`);
        }
    }
};
exports.RoleRankAudit = RoleRankAudit;
exports.RoleRankAudit = RoleRankAudit = RoleRankAudit_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(role_entity_1.RoleEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], RoleRankAudit);
//# sourceMappingURL=role-rank.audit.js.map