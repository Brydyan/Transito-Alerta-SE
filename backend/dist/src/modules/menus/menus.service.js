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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var MenusService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MenusService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const ioredis_1 = __importDefault(require("ioredis"));
const core_module_1 = require("../../core/core.module");
const user_entity_1 = require("../../entities/user.entity");
const auth_service_1 = require("../auth/auth.service");
const permission_lookup_service_1 = require("../../common/permissions/permission-lookup.service");
const menu_option_entity_1 = require("./entities/menu-option.entity");
const menu_option_role_entity_1 = require("./entities/menu-option-role.entity");
const menu_map_1 = require("./menu-map");
let MenusService = MenusService_1 = class MenusService {
    constructor(optionRepo, roleAccessRepo, userRepo, redis, authService, permissionLookup) {
        this.optionRepo = optionRepo;
        this.roleAccessRepo = roleAccessRepo;
        this.userRepo = userRepo;
        this.redis = redis;
        this.authService = authService;
        this.permissionLookup = permissionLookup;
        this.logger = new common_1.Logger(MenusService_1.name);
    }
    async getMenuForUser(userId) {
        const user = await this.userRepo.findOne({
            where: { id: userId, deletedAt: (0, typeorm_2.IsNull)() },
            select: ['id', 'roleId'],
        });
        if (!user || !user.roleId) {
            return [];
        }
        const cacheKey = `${MenusService_1.CACHE_PREFIX}${userId}`;
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        }
        catch (err) {
            this.logger.warn(`Cache read failed for ${cacheKey}: ${err.message}`);
        }
        const accessibleOptions = await this.getAccessibleOptions(user.roleId);
        const filtered = accessibleOptions;
        const tree = this.buildTree(filtered);
        try {
            await this.redis.setex(cacheKey, MenusService_1.CACHE_TTL_SECONDS, JSON.stringify(tree));
        }
        catch (err) {
            this.logger.warn(`Cache write failed for ${cacheKey}: ${err.message}`);
        }
        return tree;
    }
    async invalidateCache() {
        try {
            const keys = await this.redis.keys('menu:v1:*');
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        }
        catch (err) {
            this.logger.warn(`Cache invalidation failed: ${err.message}`);
        }
    }
    async getAccessibleOptions(roleId) {
        const options = await this.optionRepo
            .createQueryBuilder('opt')
            .innerJoin('menu_option_roles', 'mor', 'mor.menu_option_id = opt.id')
            .where('mor.role_id = :roleId', { roleId })
            .andWhere('mor.can_read = true')
            .andWhere('opt.is_active = true')
            .andWhere('opt.deleted_at IS NULL')
            .orderBy('opt.display_order', 'ASC')
            .getMany();
        return options;
    }
    buildTree(options) {
        const entryMap = new Map();
        for (const opt of options) {
            const entry = {
                label: opt.name,
                route: opt.route,
                order: opt.displayOrder,
                children: [],
            };
            if (opt.icon) {
                entry.icon = opt.icon;
            }
            entryMap.set(opt.id, { entry, parentId: opt.parentId });
        }
        const roots = [];
        for (const { entry, parentId } of entryMap.values()) {
            if (parentId && entryMap.has(parentId)) {
                entryMap.get(parentId).entry.children.push(entry);
            }
            else if (!parentId) {
                roots.push(entry);
            }
        }
        const sortByOrder = (a, b) => a.order - b.order;
        const sortTree = (entries) => {
            entries.sort(sortByOrder);
            for (const entry of entries) {
                if (entry.children.length > 0) {
                    sortTree(entry.children);
                }
            }
            return entries;
        };
        return sortTree(roots);
    }
};
exports.MenusService = MenusService;
MenusService.CACHE_PREFIX = 'menu:v1:user:';
MenusService.CACHE_TTL_SECONDS = 3600;
MenusService.ROUTE_TO_PERMISSION = new Map(Object.values(menu_map_1.MENU_MAP).map((d) => [d.route, d.requires]));
exports.MenusService = MenusService = MenusService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(menu_option_entity_1.MenuOptionEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(menu_option_role_entity_1.MenuOptionRoleEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(3, (0, common_1.Inject)(core_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        ioredis_1.default,
        auth_service_1.AuthService,
        permission_lookup_service_1.PermissionLookupService])
], MenusService);
//# sourceMappingURL=menus.service.js.map