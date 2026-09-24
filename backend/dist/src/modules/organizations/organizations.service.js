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
exports.OrganizationsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const organization_entity_1 = require("../../entities/organization.entity");
const geo_zone_entity_1 = require("../../entities/geo-zone.entity");
const geofencing_service_1 = require("../geofencing/geofencing.service");
const organizations_repository_1 = require("./organizations.repository");
let OrganizationsService = class OrganizationsService {
    constructor(repo, orgRepo, geoZoneRepo, geofencingService) {
        this.repo = repo;
        this.orgRepo = orgRepo;
        this.geoZoneRepo = geoZoneRepo;
        this.geofencingService = geofencingService;
    }
    create(dto) {
        return this.repo.create({ name: dto.name, zoneId: dto.zone_id ?? null, parentId: dto.parent_id ?? null });
    }
    async update(id, dto) {
        if (dto.parent_id) {
            await this.assertNoCycle(id, dto.parent_id);
        }
        const updated = await this.repo.update(id, {
            name: dto.name,
            zoneIdProvided: dto.zone_id !== undefined,
            zoneId: dto.zone_id,
            parentIdProvided: dto.parent_id !== undefined,
            parentId: dto.parent_id,
        });
        if (!updated) {
            throw new common_1.NotFoundException('Organization not found');
        }
        return updated;
    }
    async assertNoCycle(orgId, candidateParentId) {
        let currentId = candidateParentId;
        const visited = new Set();
        while (currentId) {
            if (currentId === orgId) {
                throw new common_1.BadRequestException('parent_id would create a cycle in the organization tree');
            }
            if (visited.has(currentId))
                break;
            visited.add(currentId);
            const current = await this.repo.findById(currentId);
            currentId = current?.parent_id ?? null;
        }
    }
    async assignCategory(id, incidentCategoryId) {
        const updated = await this.repo.updateCategory(id, incidentCategoryId);
        if (!updated) {
            throw new common_1.NotFoundException('Organization not found');
        }
        return updated;
    }
    async delete(id) {
        await this.findById(id);
        await this.repo.delete(id);
    }
    async findById(id) {
        const org = await this.repo.findById(id);
        if (!org) {
            throw new common_1.NotFoundException('Organization not found');
        }
        return org;
    }
    list(filters = {}) {
        return this.repo.findAll(filters);
    }
    findNotifiedFor(zoneId, categoryId) {
        if (zoneId === null) {
            return Promise.resolve([]);
        }
        return this.repo.findNotifiedFor(zoneId, categoryId);
    }
    async tree() {
        const orgs = await this.orgRepo.find({ where: { deletedAt: (0, typeorm_2.IsNull)() }, order: { name: 'ASC' } });
        const nodes = new Map();
        for (const o of orgs) {
            nodes.set(o.id, { id: o.id, name: o.name, zoneId: o.zoneId, children: [] });
        }
        const roots = [];
        for (const o of orgs) {
            const node = nodes.get(o.id);
            const parent = o.parentId ? nodes.get(o.parentId) : undefined;
            if (parent) {
                parent.children.push(node);
            }
            else {
                roots.push(node);
            }
        }
        return roots;
    }
    async formData() {
        const roles = await this.orgRepo.manager.find('RoleEntity', {
            select: ['id', 'name'],
            order: { name: 'ASC' },
        });
        const geoZones = await this.geoZoneRepo.find({
            select: ['id', 'name'],
            order: { name: 'ASC' },
        });
        return {
            roles,
            geoZones: geoZones.map((z) => ({ id: z.id, name: z.name })),
        };
    }
    async notifiedFor(query) {
        let zoneId = null;
        if (query.location_id) {
            zoneId = query.location_id;
        }
        else if (query.lat !== undefined && query.lng !== undefined) {
            const { zone } = await this.geofencingService.resolveZone({ lat: query.lat, lng: query.lng });
            zoneId = zone?.id ?? null;
        }
        else {
            throw new common_1.BadRequestException('Provide lat+lng or location_id');
        }
        if (!zoneId)
            return [];
        const orgs = await this.repo.findNotifiedFor(zoneId, query.category_id ?? null);
        return orgs.map((org, index) => ({ ...org, is_claimable: index === 0 }));
    }
};
exports.OrganizationsService = OrganizationsService;
exports.OrganizationsService = OrganizationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(organization_entity_1.OrganizationEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(geo_zone_entity_1.GeoZoneEntity)),
    __metadata("design:paramtypes", [organizations_repository_1.OrganizationsRepository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        geofencing_service_1.GeofencingService])
], OrganizationsService);
//# sourceMappingURL=organizations.service.js.map