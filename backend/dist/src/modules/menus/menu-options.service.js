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
var MenuOptionsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MenuOptionsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const menu_option_entity_1 = require("./entities/menu-option.entity");
const menu_option_role_entity_1 = require("./entities/menu-option-role.entity");
const api_endpoint_entity_1 = require("./entities/api-endpoint.entity");
const menu_option_endpoint_entity_1 = require("./entities/menu-option-endpoint.entity");
const role_entity_1 = require("../../entities/role.entity");
const menus_service_1 = require("./menus.service");
let MenuOptionsService = MenuOptionsService_1 = class MenuOptionsService {
    constructor(optionRepo, roleAccessRepo, endpointRepo, optionEndpointRepo, roleRepo, menusService) {
        this.optionRepo = optionRepo;
        this.roleAccessRepo = roleAccessRepo;
        this.endpointRepo = endpointRepo;
        this.optionEndpointRepo = optionEndpointRepo;
        this.roleRepo = roleRepo;
        this.menusService = menusService;
    }
    async findAll() {
        return this.optionRepo.find({
            where: { deletedAt: (0, typeorm_2.IsNull)() },
            order: { displayOrder: 'ASC' },
        });
    }
    async findOne(id) {
        const option = await this.optionRepo.findOne({
            where: { id, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (!option) {
            throw new common_1.NotFoundException(`Menu option ${id} not found`);
        }
        return option;
    }
    async create(dto) {
        await this.assertRouteUnique(dto.route);
        if (dto.parentId) {
            await this.assertValidParent(dto.parentId, null);
        }
        const option = this.optionRepo.create({
            name: dto.name,
            route: dto.route,
            icon: dto.icon ?? null,
            parentId: dto.parentId ?? null,
            displayOrder: dto.displayOrder,
            isActive: dto.isActive ?? true,
        });
        const saved = await this.optionRepo.save(option);
        await this.menusService.invalidateCache();
        return saved;
    }
    async update(id, dto) {
        const option = await this.findOne(id);
        if (dto.route !== undefined && dto.route !== option.route) {
            await this.assertRouteUnique(dto.route, id);
        }
        if (dto.parentId !== undefined && dto.parentId !== option.parentId) {
            if (dto.parentId === id) {
                throw new common_1.BadRequestException('A menu option cannot be its own parent');
            }
            if (dto.parentId) {
                await this.assertValidParent(dto.parentId, id);
            }
        }
        if (dto.name !== undefined)
            option.name = dto.name;
        if (dto.route !== undefined)
            option.route = dto.route;
        if (dto.icon !== undefined)
            option.icon = dto.icon;
        if (dto.parentId !== undefined)
            option.parentId = dto.parentId;
        if (dto.displayOrder !== undefined)
            option.displayOrder = dto.displayOrder;
        if (dto.isActive !== undefined)
            option.isActive = dto.isActive;
        const saved = await this.optionRepo.save(option);
        await this.menusService.invalidateCache();
        return saved;
    }
    async delete(id) {
        const option = await this.findOne(id);
        const children = await this.optionRepo.find({
            where: { parentId: id, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (children.length > 0) {
            throw new common_1.ConflictException(`Cannot delete menu option ${id}: it has ${children.length} child(ren). Reassign or delete them first.`);
        }
        option.deletedAt = new Date();
        await this.optionRepo.save(option);
        await this.menusService.invalidateCache();
    }
    async getRoleMatrix(optionId) {
        await this.findOne(optionId);
        const roles = await this.roleRepo.find({
            where: { deletedAt: (0, typeorm_2.IsNull)() },
            order: { name: 'ASC' },
        });
        const accessRows = await this.roleAccessRepo.find({
            where: { menuOptionId: optionId },
        });
        const accessMap = new Map();
        for (const row of accessRows) {
            accessMap.set(row.roleId, row);
        }
        const matrix = {
            platform: [],
            organization: [],
            public: [],
        };
        for (const role of roles) {
            const access = accessMap.get(role.id);
            const entry = {
                roleId: role.id,
                roleName: role.name,
                canRead: access?.canRead ?? false,
                canWrite: access?.canWrite ?? false,
            };
            const scope = role.scope ?? 'organization';
            if (scope === 'platform') {
                matrix.platform.push(entry);
            }
            else if (scope === 'public') {
                matrix.public.push(entry);
            }
            else {
                matrix.organization.push(entry);
            }
        }
        return matrix;
    }
    async setRoleAccess(optionId, roleId, dto) {
        if (dto.canWrite && !dto.canRead) {
            throw new common_1.BadRequestException('can_write requires can_read: you cannot write to something you cannot see');
        }
        await this.findOne(optionId);
        const role = await this.roleRepo.findOne({ where: { id: roleId } });
        if (!role) {
            throw new common_1.NotFoundException(`Role ${roleId} not found`);
        }
        let access = await this.roleAccessRepo.findOne({
            where: { menuOptionId: optionId, roleId },
        });
        if (access) {
            access.canRead = dto.canRead;
            access.canWrite = dto.canWrite;
        }
        else {
            access = this.roleAccessRepo.create({
                menuOptionId: optionId,
                roleId,
                canRead: dto.canRead,
                canWrite: dto.canWrite,
            });
        }
        const saved = await this.roleAccessRepo.save(access);
        await this.menusService.invalidateCache();
        return saved;
    }
    async assignEndpoints(optionId, dto) {
        await this.findOne(optionId);
        await this.optionEndpointRepo.delete({ menuOptionId: optionId });
        const assignments = [];
        for (const endpointId of dto.endpointIds) {
            const assignment = this.optionEndpointRepo.create({
                menuOptionId: optionId,
                endpointId,
            });
            const saved = await this.optionEndpointRepo.save(assignment);
            assignments.push(saved);
        }
        return assignments;
    }
    async getEndpointCatalog(query = {}) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const qb = this.endpointRepo.createQueryBuilder('ep');
        if (query.route) {
            qb.andWhere('ep.path ILIKE :route', { route: `%${query.route}%` });
        }
        if (query.method) {
            qb.andWhere('ep.method = :method', { method: query.method.toUpperCase() });
        }
        if (query.description) {
            qb.andWhere('ep.description ILIKE :desc', { description: `%${query.description}%` });
        }
        if (query.module && query.module.trim().length > 0) {
            qb.andWhere('ep.path ILIKE :module', { module: `%${query.module.trim()}%` });
        }
        qb.orderBy('ep.method', 'ASC')
            .addOrderBy('ep.path', 'ASC')
            .skip((page - 1) * limit)
            .take(limit);
        const [data, total] = await qb.getManyAndCount();
        return { data, total, page, limit };
    }
    async getAssignedEndpoints(optionId) {
        const option = await this.findOne(optionId);
        const direct = await this.queryAssignedFromJunction(optionId);
        if (direct.length > 0) {
            return direct;
        }
        const inferred = await this.inferApiModule(option);
        if (!inferred) {
            return [];
        }
        return this.queryEndpointsInModule(inferred.apiModule, option, inferred.isLevel3);
    }
    async queryAssignedFromJunction(optionId) {
        return this.endpointRepo
            .createQueryBuilder('ep')
            .innerJoin('menu_option_endpoints', 'moe', 'moe.endpoint_id = ep.id AND moe.menu_option_id = :optionId', { optionId })
            .orderBy('ep.method', 'ASC')
            .addOrderBy('ep.path', 'ASC')
            .getMany();
    }
    async inferApiModule(option) {
        if (!option.parentId) {
            return null;
        }
        const parent = await this.optionRepo.findOne({
            where: { id: option.parentId },
        });
        if (!parent) {
            return null;
        }
        if (parent.parentId) {
            const apiModule = MenuOptionsService_1.NAME_TO_API_MODULE[parent.name] ?? null;
            return apiModule ? { apiModule, isLevel3: true } : null;
        }
        const apiModule = MenuOptionsService_1.NAME_TO_API_MODULE[option.name] ?? null;
        return apiModule ? { apiModule, isLevel3: false } : null;
    }
    async queryEndpointsInModule(apiModule, option, isLevel3) {
        const pathPrefix = `/api/${apiModule}`;
        const qb = this.endpointRepo
            .createQueryBuilder('ep')
            .orderBy('ep.method', 'ASC')
            .addOrderBy('ep.path', 'ASC');
        if (isLevel3) {
            const lowerName = option.name.toLowerCase();
            if (lowerName.startsWith('crear ')) {
                qb.where('ep.method = :method AND ep.path = :path', {
                    method: 'POST',
                    path: pathPrefix,
                });
            }
            else if (lowerName.startsWith('editar ')) {
                qb.where('ep.method = :method AND ep.path LIKE :pattern', {
                    method: 'PATCH',
                    pattern: `${pathPrefix}/%`,
                });
            }
            else if (lowerName.startsWith('ver ')) {
                qb.where('ep.method = :method AND ep.path LIKE :pattern', {
                    method: 'GET',
                    pattern: `${pathPrefix}%`,
                });
            }
            else {
                qb.where('ep.path LIKE :pattern', { pattern: `${pathPrefix}%` });
            }
        }
        else {
            qb.where('ep.path LIKE :pattern', { pattern: `${pathPrefix}%` });
        }
        return qb.getMany();
    }
    async assertRouteUnique(route, excludeId) {
        const existing = await this.optionRepo.findOne({
            where: { route, deletedAt: (0, typeorm_2.IsNull)() },
        });
        if (existing && existing.id !== excludeId) {
            throw new common_1.ConflictException(`Route '${route}' is already used by another menu option`);
        }
    }
    async assertValidParent(parentId, childId) {
        if (childId && parentId === childId) {
            throw new common_1.BadRequestException('A menu option cannot be its own parent');
        }
        const parent = await this.optionRepo.findOne({ where: { id: parentId, deletedAt: (0, typeorm_2.IsNull)() } });
        if (!parent) {
            throw new common_1.NotFoundException(`Parent menu option ${parentId} not found`);
        }
        if (childId) {
            const visited = new Set([childId]);
            let current = await this.optionRepo.findOne({
                where: { id: childId, deletedAt: (0, typeorm_2.IsNull)() },
            });
            while (current?.parentId) {
                if (current.parentId === parentId) {
                    throw new common_1.BadRequestException(`Cycle detected: setting parent to ${parentId} would create a cycle in the menu hierarchy`);
                }
                if (visited.has(current.parentId)) {
                    throw new common_1.BadRequestException(`Cycle detected: setting parent to ${parentId} would create a cycle in the menu hierarchy`);
                }
                visited.add(current.parentId);
                current = await this.optionRepo.findOne({
                    where: { id: current.parentId, deletedAt: (0, typeorm_2.IsNull)() },
                });
            }
        }
    }
};
exports.MenuOptionsService = MenuOptionsService;
MenuOptionsService.NAME_TO_API_MODULE = {
    Usuarios: 'users',
    Roles: 'roles',
    Organizaciones: 'organizations',
    Departamentos: 'departments',
    'Auditoría de Acceso': 'audit-logs',
    Controles: 'menu-options',
    Ubicaciones: 'geo-zones',
    Categorías: 'incident-categories',
    'Lista de Incidencias': 'incidents',
    Mapa: 'geo-zones',
    Reportar: 'incidents',
    Inicio: 'incidents',
};
exports.MenuOptionsService = MenuOptionsService = MenuOptionsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(menu_option_entity_1.MenuOptionEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(menu_option_role_entity_1.MenuOptionRoleEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(api_endpoint_entity_1.ApiEndpointEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(menu_option_endpoint_entity_1.MenuOptionEndpointEntity)),
    __param(4, (0, typeorm_1.InjectRepository)(role_entity_1.RoleEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        menus_service_1.MenusService])
], MenuOptionsService);
//# sourceMappingURL=menu-options.service.js.map