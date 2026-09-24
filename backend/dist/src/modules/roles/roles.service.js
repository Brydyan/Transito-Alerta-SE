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
exports.RolesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const role_entity_1 = require("../../entities/role.entity");
const user_entity_1 = require("../../entities/user.entity");
const permission_entity_1 = require("../../entities/permission.entity");
const menu_option_role_entity_1 = require("../menus/entities/menu-option-role.entity");
const menu_option_entity_1 = require("../menus/entities/menu-option.entity");
const assert_can_manage_1 = require("../../common/authz/assert-can-manage");
const auth_service_1 = require("../auth/auth.service");
const SEEDED_ROLE_NAMES = new Set([
    'master',
    'admin_org',
    'operador_org',
    'operador_sistema',
    'reporter',
]);
let RolesService = class RolesService {
    constructor(roleRepo, userRepo, permissionRepo, menuRoleRepo, menuOptionRepo, dataSource, authService) {
        this.roleRepo = roleRepo;
        this.userRepo = userRepo;
        this.permissionRepo = permissionRepo;
        this.menuRoleRepo = menuRoleRepo;
        this.menuOptionRepo = menuOptionRepo;
        this.dataSource = dataSource;
        this.authService = authService;
    }
    async listPermissions(roleId) {
        const role = await this.roleRepo.findOne({ where: { id: roleId } });
        if (!role) {
            throw new common_1.NotFoundException(`Role ${roleId} not found`);
        }
        return role.permissions ?? [];
    }
    async getMenuAccessByRole(roleId) {
        const role = await this.roleRepo.findOne({ where: { id: roleId } });
        if (!role) {
            throw new common_1.NotFoundException(`Role ${roleId} not found`);
        }
        const accesses = await this.dataSource.query(`SELECT
        mor.menu_option_id,
        mo.name,
        mor.can_read,
        mor.can_write
      FROM menu_option_roles mor
      INNER JOIN menu_options mo ON mor.menu_option_id = mo.id
      WHERE mor.role_id = $1 AND mo.deleted_at IS NULL
      ORDER BY mo.display_order ASC`, [roleId]);
        return accesses.map(row => ({
            menuOptionId: row.menu_option_id,
            name: row.name,
            canRead: row.can_read,
            canWrite: row.can_write,
        }));
    }
    async assignRole(actor, userId, roleId) {
        const role = await this.roleRepo.findOne({ where: { id: roleId } });
        if (!role) {
            throw new common_1.NotFoundException(`Role ${roleId} not found`);
        }
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException(`User ${userId} not found`);
        }
        const currentRole = user.roleId
            ? await this.roleRepo.findOne({ where: { id: user.roleId } })
            : null;
        (0, assert_can_manage_1.assertCanManage)(actor, {
            id: user.id,
            organizationId: user.organizationId,
            roleName: currentRole?.name ?? null,
        });
        (0, assert_can_manage_1.assertCanGrantRole)(actor, role.name ?? null);
        user.roleId = role.id;
        user.permissions = role.permissions ?? [];
        user.permissionVersion = (user.permissionVersion ?? 1) + 1;
        const saved = await this.userRepo.save(user);
        await this.authService.invalidatePermissionCache(saved.id, saved.deviceUuid);
        return saved;
    }
    async findAll() {
        return this.roleRepo.find({ where: { deletedAt: (0, typeorm_2.IsNull)() }, order: { name: 'ASC' } });
    }
    async findOne(id) {
        const role = await this.roleRepo.findOne({ where: { id } });
        if (!role) {
            throw new common_1.NotFoundException(`Role ${id} not found`);
        }
        return role;
    }
    async getStats() {
        const roles = await this.roleRepo.find({
            where: { deletedAt: (0, typeorm_2.IsNull)() },
            select: ['id', 'permissions'],
        });
        const allPerms = new Set();
        const modules = new Set();
        for (const role of roles) {
            for (const perm of role.permissions ?? []) {
                allPerms.add(perm);
                const parts = perm.split(' ');
                if (parts.length === 2) {
                    modules.add(parts[1]);
                }
            }
        }
        const assignedUsers = await this.userRepo.count({
            where: { roleId: (0, typeorm_2.Not)((0, typeorm_2.IsNull)()), deletedAt: (0, typeorm_2.IsNull)() },
        });
        return {
            totalPermissions: allPerms.size,
            protectedModules: modules.size,
            assignedUsers,
        };
    }
    async create(dto) {
        this.assertRevealOnlyForMaster(dto.name, dto.permissions ?? []);
        const role = this.roleRepo.create({
            name: dto.name,
            permissions: dto.permissions ?? [],
        });
        return this.roleRepo.save(role);
    }
    async update(id, dto) {
        const role = await this.findOne(id);
        const resultingName = dto.name ?? role.name;
        const resultingPermissions = dto.permissions !== undefined ? dto.permissions : role.permissions ?? [];
        this.assertRevealOnlyForMaster(resultingName, resultingPermissions);
        if (dto.name !== undefined && dto.name !== role.name) {
            this.assertSeededNameNotRenamed(role.name, dto.name);
        }
        const nextPermissions = dto.permissions;
        const permissionsChanged = nextPermissions !== undefined;
        if (dto.name !== undefined) {
            role.name = dto.name;
        }
        if (permissionsChanged) {
            role.permissions = nextPermissions;
        }
        const saved = await this.roleRepo.save(role);
        if (permissionsChanged) {
            const affectedUsers = await this.userRepo.find({ where: { roleId: id } });
            await Promise.all(affectedUsers.map(async (user) => {
                user.permissions = saved.permissions;
                user.permissionVersion = (user.permissionVersion ?? 1) + 1;
                await this.userRepo.save(user);
                await this.authService.invalidatePermissionCache(user.id, user.deviceUuid);
            }));
        }
        return saved;
    }
    async delete(id) {
        const role = await this.findOne(id);
        role.deletedAt = new Date();
        await this.roleRepo.save(role);
        const affectedUsers = await this.userRepo.find({ where: { roleId: id } });
        await Promise.all(affectedUsers.map(async (user) => {
            user.permissionVersion = (user.permissionVersion ?? 1) + 1;
            await this.userRepo.save(user);
            await this.authService.invalidatePermissionCache(user.id, user.deviceUuid);
        }));
    }
    async recalculateEffectivePermissions(id) {
        const role = await this.findOne(id);
        const deletedPermissions = await this.permissionRepo.find({
            where: { deletedAt: (0, typeorm_2.Not)((0, typeorm_2.IsNull)()) },
        });
        const revoked = new Set(deletedPermissions.map((p) => p.id));
        const before = role.permissions ?? [];
        const after = before.filter((p) => !revoked.has(p));
        if (after.length === before.length) {
            return role;
        }
        role.permissions = after;
        const saved = await this.roleRepo.save(role);
        const affectedUsers = await this.userRepo.find({ where: { roleId: id } });
        await Promise.all(affectedUsers.map(async (user) => {
            user.permissions = after;
            user.permissionVersion = (user.permissionVersion ?? 1) + 1;
            await this.userRepo.save(user);
            await this.authService.invalidatePermissionCache(user.id, user.deviceUuid);
        }));
        return saved;
    }
    async syncPermissions(id, permissions) {
        const role = await this.findOne(id);
        this.assertRevealOnlyForMaster(role.name, permissions);
        const saved = await this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(role_entity_1.RoleEntity);
            role.permissions = permissions;
            return repo.save(role);
        });
        const affectedUsers = await this.userRepo.find({ where: { roleId: id } });
        await Promise.all(affectedUsers.map(async (user) => {
            user.permissions = saved.permissions;
            user.permissionVersion = (user.permissionVersion ?? 1) + 1;
            await this.userRepo.save(user);
            await this.authService.invalidatePermissionCache(user.id, user.deviceUuid);
        }));
        return saved;
    }
    assertRevealOnlyForMaster(roleName, permissions) {
        const wantsReveal = (permissions ?? []).includes('REVEAL incidents');
        if (wantsReveal && roleName !== 'master') {
            throw new common_1.BadRequestException({
                code: 'REVEAL_NOT_GRANTABLE',
                message: `REVEAL incidents is reserved for the master role; role '${roleName ?? '<unnamed>'}' cannot hold it.`,
            });
        }
    }
    assertSeededNameNotRenamed(currentName, nextName) {
        if (currentName === nextName) {
            return;
        }
        const currentIsSeeded = currentName !== null && SEEDED_ROLE_NAMES.has(currentName);
        const nextIsSeeded = SEEDED_ROLE_NAMES.has(nextName);
        if (currentIsSeeded || nextIsSeeded) {
            const seededList = Array.from(SEEDED_ROLE_NAMES).join(', ');
            const from = currentName ?? '<null>';
            throw new common_1.BadRequestException({
                code: 'SEEDED_ROLE_RENAME_FORBIDDEN',
                message: `Renaming a seeded role name is forbidden. ` +
                    `Seeded names: ${seededList}. ` +
                    `Got: '${from}' -> '${nextName}'.`,
            });
        }
    }
};
exports.RolesService = RolesService;
exports.RolesService = RolesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(role_entity_1.RoleEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(permission_entity_1.PermissionEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(menu_option_role_entity_1.MenuOptionRoleEntity)),
    __param(4, (0, typeorm_1.InjectRepository)(menu_option_entity_1.MenuOptionEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        auth_service_1.AuthService])
], RolesService);
//# sourceMappingURL=roles.service.js.map