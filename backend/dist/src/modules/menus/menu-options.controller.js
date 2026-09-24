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
exports.MenuOptionsController = void 0;
const common_1 = require("@nestjs/common");
const require_permission_decorator_1 = require("../../common/decorators/require-permission.decorator");
const permission_guard_1 = require("../../common/guards/permission.guard");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const create_menu_option_dto_1 = require("./dto/create-menu-option.dto");
const update_menu_option_dto_1 = require("./dto/update-menu-option.dto");
const set_role_access_dto_1 = require("./dto/set-role-access.dto");
const assign_endpoints_dto_1 = require("./dto/assign-endpoints.dto");
const menu_options_service_1 = require("./menu-options.service");
let MenuOptionsController = class MenuOptionsController {
    constructor(menuOptionsService) {
        this.menuOptionsService = menuOptionsService;
    }
    findAll() {
        return this.menuOptionsService.findAll();
    }
    getEndpointCatalog(page, limit, route, method, description, module) {
        return this.menuOptionsService.getEndpointCatalog({
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            route,
            method,
            description,
            module,
        });
    }
    findOne(id) {
        return this.menuOptionsService.findOne(id);
    }
    create(dto) {
        return this.menuOptionsService.create(dto);
    }
    update(id, dto) {
        return this.menuOptionsService.update(id, dto);
    }
    delete(id) {
        return this.menuOptionsService.delete(id);
    }
    getRoleMatrix(id) {
        return this.menuOptionsService.getRoleMatrix(id);
    }
    setRoleAccess(id, roleId, dto) {
        return this.menuOptionsService.setRoleAccess(id, roleId, dto);
    }
    getAssignedEndpoints(id) {
        return this.menuOptionsService.getAssignedEndpoints(id);
    }
    assignEndpoints(id, dto) {
        return this.menuOptionsService.assignEndpoints(id, dto);
    }
};
exports.MenuOptionsController = MenuOptionsController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'menu-options'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MenuOptionsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('endpoints'),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'menu-options'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('route')),
    __param(3, (0, common_1.Query)('method')),
    __param(4, (0, common_1.Query)('description')),
    __param(5, (0, common_1.Query)('module')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], MenuOptionsController.prototype, "getEndpointCatalog", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'menu-options'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MenuOptionsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('CREATE', 'menu-options'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_menu_option_dto_1.CreateMenuOptionDto]),
    __metadata("design:returntype", Promise)
], MenuOptionsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('UPDATE', 'menu-options'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_menu_option_dto_1.UpdateMenuOptionDto]),
    __metadata("design:returntype", Promise)
], MenuOptionsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('DELETE', 'menu-options'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MenuOptionsController.prototype, "delete", null);
__decorate([
    (0, common_1.Get)(':id/roles'),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'menu-options'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MenuOptionsController.prototype, "getRoleMatrix", null);
__decorate([
    (0, common_1.Put)(':id/roles/:roleId'),
    (0, require_permission_decorator_1.RequirePermission)('UPDATE', 'menu-options'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('roleId', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, set_role_access_dto_1.SetRoleAccessDto]),
    __metadata("design:returntype", Promise)
], MenuOptionsController.prototype, "setRoleAccess", null);
__decorate([
    (0, common_1.Get)(':id/endpoints'),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'menu-options'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MenuOptionsController.prototype, "getAssignedEndpoints", null);
__decorate([
    (0, common_1.Put)(':id/endpoints'),
    (0, require_permission_decorator_1.RequirePermission)('UPDATE', 'menu-options'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, assign_endpoints_dto_1.AssignEndpointsDto]),
    __metadata("design:returntype", Promise)
], MenuOptionsController.prototype, "assignEndpoints", null);
exports.MenuOptionsController = MenuOptionsController = __decorate([
    (0, common_1.Controller)('menu-options'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [menu_options_service_1.MenuOptionsService])
], MenuOptionsController);
//# sourceMappingURL=menu-options.controller.js.map