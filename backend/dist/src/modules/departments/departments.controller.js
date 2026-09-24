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
exports.DepartmentsController = void 0;
const common_1 = require("@nestjs/common");
const require_permission_decorator_1 = require("../../common/decorators/require-permission.decorator");
const permission_guard_1 = require("../../common/guards/permission.guard");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const departments_service_1 = require("./departments.service");
const create_department_dto_1 = require("./dto/create-department.dto");
const update_department_dto_1 = require("./dto/update-department.dto");
const GLOBAL_ROLES = new Set(['master', 'operador_sistema']);
let DepartmentsController = class DepartmentsController {
    constructor(departmentsService) {
        this.departmentsService = departmentsService;
    }
    async list(query, req) {
        const user = req.user;
        const scopedOrgId = user.roleName && GLOBAL_ROLES.has(user.roleName)
            ? query.organization_id
            : user.organizationId;
        const pageNum = query.page !== undefined ? parseInt(query.page, 10) : undefined;
        const perPageNum = query.per_page !== undefined ? parseInt(query.per_page, 10) : undefined;
        return this.departmentsService.list({
            organizationId: scopedOrgId ?? '',
            page: Number.isFinite(pageNum) ? pageNum : undefined,
            perPage: Number.isFinite(perPageNum) ? perPageNum : undefined,
            search: query.search,
        });
    }
    async create(dto, req) {
        const user = req.user;
        const isGlobal = user.roleName !== null && GLOBAL_ROLES.has(user.roleName);
        if (!isGlobal) {
            if (!user.organizationId) {
                throw new common_1.ForbiddenException('Caller has no organization scope');
            }
            if (dto.organization_id !== user.organizationId) {
                throw new common_1.ForbiddenException('Cannot create a department in another organization');
            }
        }
        return this.departmentsService.createWithCategories({
            name: dto.name,
            description: dto.description ?? null,
            organizationId: dto.organization_id,
        }, dto.category_ids ?? []);
    }
    async formData() {
        const rows = await this.departmentsService.listIncidentCategoriesForForm();
        return { incident_categories: rows };
    }
    async findOne(id, req) {
        const dept = await this.departmentsService.findById(id);
        this.assertSameOrg(dept.organization_id, req);
        return this.departmentsService.findByIdWithCategories(id);
    }
    async update(id, dto, req) {
        const existing = await this.departmentsService.findById(id);
        this.assertSameOrg(existing.organization_id, req);
        return this.departmentsService.updateWithCategories(id, {
            name: dto.name,
            descriptionProvided: dto.description !== undefined,
            description: dto.description,
        }, dto.category_ids ?? null);
    }
    async remove(id, req) {
        const existing = await this.departmentsService.findById(id);
        this.assertSameOrg(existing.organization_id, req);
        return this.departmentsService.delete(id);
    }
    assertSameOrg(deptOrgId, req) {
        const user = req.user;
        if (user.roleName !== null && GLOBAL_ROLES.has(user.roleName)) {
            return;
        }
        if (!user.organizationId || user.organizationId !== deptOrgId) {
            throw new common_1.ForbiddenException('Department belongs to another organization');
        }
    }
};
exports.DepartmentsController = DepartmentsController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'departments'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DepartmentsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('CREATE', 'departments'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_department_dto_1.CreateDepartmentDto, Object]),
    __metadata("design:returntype", Promise)
], DepartmentsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('form-data'),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'departments'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DepartmentsController.prototype, "formData", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'departments'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DepartmentsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('UPDATE', 'departments'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_department_dto_1.UpdateDepartmentDto, Object]),
    __metadata("design:returntype", Promise)
], DepartmentsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('DELETE', 'departments'),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DepartmentsController.prototype, "remove", null);
exports.DepartmentsController = DepartmentsController = __decorate([
    (0, common_1.Controller)('departments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [departments_service_1.DepartmentsService])
], DepartmentsController);
//# sourceMappingURL=departments.controller.js.map