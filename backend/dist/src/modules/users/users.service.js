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
exports.UsersService = exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const role_entity_1 = require("../../entities/role.entity");
const organization_entity_1 = require("../../entities/organization.entity");
const assert_can_manage_1 = require("../../common/authz/assert-can-manage");
const auth_service_1 = require("../auth/auth.service");
const session_response_dto_1 = require("../sessions/dto/session-response.dto");
const sessions_repository_1 = require("../sessions/sessions.repository");
const avatar_storage_service_1 = require("./avatar-storage.service");
const role_exclusions_constants_1 = require("./role-exclusions.constants");
exports.DEFAULT_PAGE_SIZE = 20;
exports.MAX_PAGE_SIZE = 100;
let UsersService = class UsersService {
    constructor(userRepo, avatarStorage, roleRepo, orgRepo, authService, sessionsRepository) {
        this.userRepo = userRepo;
        this.avatarStorage = avatarStorage;
        this.roleRepo = roleRepo;
        this.orgRepo = orgRepo;
        this.authService = authService;
        this.sessionsRepository = sessionsRepository;
    }
    async findById(id) {
        const user = await this.userRepo.findOne({ where: { id, deletedAt: (0, typeorm_2.IsNull)() } });
        if (!user) {
            throw new common_1.NotFoundException(`User ${id} not found`);
        }
        return user;
    }
    async getFormData(currentUser) {
        const isSystemAdmin = currentUser.roleName === role_exclusions_constants_1.SYSTEM_ADMIN_ROLE_NAME;
        const roles = await this.roleRepo.find({
            select: ['id', 'name'],
            where: isSystemAdmin
                ? {}
                : { name: (0, typeorm_2.Not)((0, typeorm_2.In)(role_exclusions_constants_1.SYSTEM_ONLY_ROLES)) },
            order: { name: 'ASC' },
        });
        const organizations = isSystemAdmin
            ? await this.orgRepo.find({ select: ['id', 'name'], order: { name: 'ASC' } })
            : currentUser.organizationId
                ? await this.orgRepo.find({
                    select: ['id', 'name'],
                    where: { id: currentUser.organizationId },
                    order: { name: 'ASC' },
                })
                : [];
        return {
            roles: roles.map((r) => ({ id: r.id, name: r.name })),
            organizations: organizations.map((o) => ({ id: o.id, name: o.name })),
        };
    }
    async findOne(id) {
        return this.userRepo.findOne({ where: { id } });
    }
    async findByRole(roleName) {
        return this.userRepo
            .createQueryBuilder('u')
            .leftJoin('roles', 'r', 'u.role_id = r.id')
            .where('r.name = :roleName', { roleName })
            .getMany();
    }
    async updateProfile(id, input) {
        await this.userRepo.update(id, input);
        return this.findById(id);
    }
    async updateAvatar(id, file) {
        const avatarUrl = await this.avatarStorage.upload(id, file);
        await this.userRepo.update(id, { avatarUrl });
        return this.findById(id);
    }
    async list(page = 1, limit = exports.DEFAULT_PAGE_SIZE, scope, callerId) {
        const take = Math.min(limit, exports.MAX_PAGE_SIZE);
        const safePage = Math.max(page, 1);
        const skip = (safePage - 1) * take;
        switch (scope.kind) {
            case 'global':
                return this.findAndCount({ take, skip });
            case 'org':
            case 'org_assigned':
                return this.findAndCount({ take, skip, where: { organizationId: scope.organizationId } });
            case 'public': {
                if (!callerId) {
                    return { items: [], total: 0 };
                }
                const self = await this.userRepo.findOne({ where: { id: callerId } });
                return self ? { items: [self], total: 1 } : { items: [], total: 0 };
            }
            case 'deny':
                return { items: [], total: 0 };
        }
    }
    async findAndCount(options) {
        const findOptions = {
            ...options,
            where: { ...options.where, isActive: true },
        };
        const [items, total] = await this.userRepo.findAndCount(findOptions);
        return { items, total };
    }
    async getSessionsForSelf(actor) {
        const rows = await this.sessionsRepository.findActiveByUser(actor.userId);
        return rows.map((row) => (0, session_response_dto_1.toSessionResponseDto)(row, actor.sessionId));
    }
    async getSessionsForUser(actor, targetUserId) {
        const target = await this.sessionsRepository.findManageableTarget(targetUserId);
        if (!target) {
            throw new common_1.NotFoundException(`User ${targetUserId} not found`);
        }
        (0, assert_can_manage_1.assertVisible)(actor, target);
        const rows = await this.sessionsRepository.findActiveByUser(targetUserId);
        return rows.map((row) => (0, session_response_dto_1.toSessionResponseDto)(row, actor.sessionId));
    }
    async updateOrganization(actor, targetId, organizationId) {
        const target = await this.userRepo.findOne({ where: { id: targetId } });
        if (!target) {
            throw new common_1.NotFoundException(`User ${targetId} not found`);
        }
        const role = target.roleId
            ? await this.roleRepo.findOne({ where: { id: target.roleId } })
            : null;
        (0, assert_can_manage_1.assertCanManage)(actor, {
            id: target.id,
            organizationId: target.organizationId,
            roleName: role?.name ?? null,
        });
        await this.userRepo.update(targetId, { organizationId });
        await this.authService.invalidatePermissionCache(target.id, target.deviceUuid);
        return this.findById(targetId);
    }
    async adminCreate(dto) {
        let permissions = [];
        let permissionVersion = 1;
        if (dto.role_id) {
            const role = await this.roleRepo.findOne({ where: { id: dto.role_id } });
            if (!role) {
                throw new common_1.NotFoundException(`Role ${dto.role_id} not found`);
            }
            permissions = role.permissions ?? [];
            permissionVersion = 2;
        }
        const tempDeviceUuid = `admin-bootstrap-${dto.email}-${Date.now()}`;
        const user = this.userRepo.create({
            email: dto.email,
            deviceUuid: tempDeviceUuid,
            firstName: dto.first_name ?? null,
            lastName: dto.last_name ?? null,
            phone: dto.phone ?? null,
            organizationId: dto.organization_id ?? null,
            roleId: dto.role_id ?? null,
            isActive: false,
            permissions,
            permissionVersion,
        });
        return this.userRepo.save(user);
    }
    async adminUpdate(id, dto) {
        const target = await this.findById(id);
        if (dto.email !== undefined && dto.email !== target.email) {
            const conflict = await this.userRepo.findOne({
                where: { email: dto.email, deletedAt: (0, typeorm_2.IsNull)() },
            });
            if (conflict && conflict.id !== target.id) {
                throw new common_1.ConflictException(`El correo ${dto.email} ya está registrado por otro usuario`);
            }
        }
        if (dto.role_id !== undefined) {
            const role = await this.roleRepo.findOne({ where: { id: dto.role_id } });
            if (!role) {
                throw new common_1.NotFoundException(`Role ${dto.role_id} not found`);
            }
            target.roleId = role.id;
            target.permissions = role.permissions ?? [];
            target.permissionVersion = (target.permissionVersion ?? 1) + 1;
        }
        if (dto.organization_id !== undefined) {
            target.organizationId = dto.organization_id;
        }
        if (dto.first_name !== undefined) {
            target.firstName = dto.first_name;
        }
        if (dto.last_name !== undefined) {
            target.lastName = dto.last_name;
        }
        if (dto.email !== undefined) {
            target.email = dto.email;
        }
        if (dto.phone !== undefined) {
            target.phone = dto.phone;
        }
        const saved = await this.userRepo.save(target);
        await this.authService.invalidatePermissionCache(saved.id, saved.deviceUuid);
        return saved;
    }
    async softDelete(id) {
        const target = await this.findById(id);
        await this.userRepo.update(id, {
            deletedAt: new Date(),
            isActive: false,
            firstName: 'Usuario eliminado',
            lastName: null,
            email: `deleted+${id}@tase.invalid`,
            avatarUrl: null,
            passwordHash: null,
            deviceUuid: null,
            verificationOtp: null,
            verificationOtpExpiresAt: null,
            phone: null,
        });
        await this.authService.invalidatePermissionCache(target.id, target.deviceUuid);
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(role_entity_1.RoleEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(organization_entity_1.OrganizationEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        avatar_storage_service_1.AvatarStorageService,
        typeorm_2.Repository,
        typeorm_2.Repository,
        auth_service_1.AuthService,
        sessions_repository_1.SessionsRepository])
], UsersService);
//# sourceMappingURL=users.service.js.map