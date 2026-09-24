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
var PermissionLookupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionLookupService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const permission_entity_1 = require("../../entities/permission.entity");
let PermissionLookupService = PermissionLookupService_1 = class PermissionLookupService {
    constructor(permissionRepo) {
        this.permissionRepo = permissionRepo;
        this.logger = new common_1.Logger(PermissionLookupService_1.name);
        this.cache = null;
        this.reverseCache = null;
    }
    async getUuid(action, resource) {
        if (!this.cache) {
            await this.buildCache();
        }
        return this.cache?.get(this.key(action, resource)) ?? null;
    }
    getUuidSync(action, resource) {
        if (!this.cache) {
            throw new Error('PermissionLookupService.getUuidSync() llamado antes de buildCache()');
        }
        return this.cache.get(this.key(action, resource)) ?? null;
    }
    async buildCache() {
        const rows = await this.permissionRepo.find({
            where: { deletedAt: (0, typeorm_2.IsNull)() },
            select: ['id', 'action', 'resource'],
        });
        const map = new Map();
        const reverse = new Map();
        for (const row of rows) {
            const k = this.key(row.action, row.resource);
            map.set(k, row.id);
            reverse.set(row.id, k);
        }
        this.cache = map;
        this.reverseCache = reverse;
        this.logger.log(`Catalog index rebuilt: ${map.size} permisos activos`);
    }
    async getDescriptionsByUuids(uuids) {
        if (!uuids || uuids.length === 0) {
            return [];
        }
        if (!this.cache) {
            await this.buildCache();
        }
        const rows = await this.permissionRepo.find({
            where: { id: (0, typeorm_2.In)(uuids), deletedAt: (0, typeorm_2.IsNull)() },
            select: ['id', 'action', 'resource'],
        });
        return rows.map((row) => `${row.action} ${row.resource}`);
    }
    invalidate() {
        this.cache = null;
        this.reverseCache = null;
    }
    async getNamesByUuids(uuids) {
        if (!this.cache || !this.reverseCache) {
            await this.buildCache();
        }
        const names = [];
        for (const uuid of uuids) {
            const name = this.reverseCache.get(uuid);
            if (name) {
                names.push(name);
            }
        }
        return names;
    }
    getNamesByUuidsSync(uuids) {
        if (!this.cache || !this.reverseCache) {
            throw new Error('PermissionLookupService.getNamesByUuidsSync() llamado antes de buildCache()');
        }
        const names = [];
        for (const uuid of uuids) {
            const name = this.reverseCache.get(uuid);
            if (name) {
                names.push(name);
            }
        }
        return names;
    }
    key(action, resource) {
        return `${action} ${resource}`;
    }
};
exports.PermissionLookupService = PermissionLookupService;
exports.PermissionLookupService = PermissionLookupService = PermissionLookupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(permission_entity_1.PermissionEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], PermissionLookupService);
//# sourceMappingURL=permission-lookup.service.js.map