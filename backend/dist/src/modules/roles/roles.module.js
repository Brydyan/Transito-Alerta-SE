"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RolesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const role_entity_1 = require("../../entities/role.entity");
const user_entity_1 = require("../../entities/user.entity");
const permission_entity_1 = require("../../entities/permission.entity");
const menu_option_role_entity_1 = require("../menus/entities/menu-option-role.entity");
const menu_option_entity_1 = require("../menus/entities/menu-option.entity");
const role_rank_audit_1 = require("../../common/authz/role-rank.audit");
const auth_module_1 = require("../auth/auth.module");
const roles_controller_1 = require("./roles.controller");
const roles_service_1 = require("./roles.service");
let RolesModule = class RolesModule {
};
exports.RolesModule = RolesModule;
exports.RolesModule = RolesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([role_entity_1.RoleEntity, user_entity_1.UserEntity, permission_entity_1.PermissionEntity, menu_option_role_entity_1.MenuOptionRoleEntity, menu_option_entity_1.MenuOptionEntity]),
            auth_module_1.AuthModule,
        ],
        controllers: [roles_controller_1.RolesController],
        providers: [roles_service_1.RolesService, role_rank_audit_1.RoleRankAudit],
        exports: [roles_service_1.RolesService],
    })
], RolesModule);
//# sourceMappingURL=roles.module.js.map