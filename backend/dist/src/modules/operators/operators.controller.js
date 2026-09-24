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
exports.OperatorsController = void 0;
const common_1 = require("@nestjs/common");
const require_permission_decorator_1 = require("../../common/decorators/require-permission.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../../common/guards/permission.guard");
const update_location_dto_1 = require("./dto/update-location.dto");
const dashboard_query_dto_1 = require("./dto/dashboard-query.dto");
const operator_role_constants_1 = require("./operator-role.constants");
const operator_location_service_1 = require("./operator-location.service");
const operator_dashboard_service_1 = require("./operator-dashboard.service");
let OperatorsController = class OperatorsController {
    constructor(locationService, dashboardService) {
        this.locationService = locationService;
        this.dashboardService = dashboardService;
    }
    async recordLocation(dto, req) {
        const user = req.user;
        const roleName = user.roleName ?? '';
        const isSystemAdmin = roleName === 'master';
        if (!isSystemAdmin && !operator_role_constants_1.OPERATOR_PING_ROLES.includes(roleName)) {
            throw new common_1.ForbiddenException('Operator role required to ping location');
        }
        const orgId = user.organizationId ?? 'system';
        await this.locationService.record(user.userId, orgId, dto.lat, dto.lng);
        return { status: 'ok' };
    }
    async getLocations(req) {
        const user = req.user;
        const roleName = user.roleName ?? '';
        const isSystemAdmin = roleName === 'master';
        if (!isSystemAdmin && !operator_role_constants_1.OPERATOR_QUERY_ROLES.includes(roleName)) {
            throw new common_1.ForbiddenException('Operator or admin role required to view locations');
        }
        const operators = await this.locationService.activeFor(user.organizationId, isSystemAdmin);
        return { operators };
    }
    async getDashboard(query, req) {
        const user = req.user;
        const roleName = user.roleName ?? '';
        if (!operator_role_constants_1.OPERATOR_PING_ROLES.includes(roleName)) {
            throw new common_1.ForbiddenException('Operator role required to access dashboard');
        }
        return this.dashboardService.forOperator(user.userId, query);
    }
};
exports.OperatorsController = OperatorsController;
__decorate([
    (0, common_1.Post)('location'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_location_dto_1.UpdateLocationDto, Object]),
    __metadata("design:returntype", Promise)
], OperatorsController.prototype, "recordLocation", null);
__decorate([
    (0, common_1.Get)('locations'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OperatorsController.prototype, "getLocations", null);
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'dashboard'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dashboard_query_dto_1.DashboardQueryDto, Object]),
    __metadata("design:returntype", Promise)
], OperatorsController.prototype, "getDashboard", null);
exports.OperatorsController = OperatorsController = __decorate([
    (0, common_1.Controller)('operator'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [operator_location_service_1.OperatorLocationService,
        operator_dashboard_service_1.OperatorDashboardService])
], OperatorsController);
//# sourceMappingURL=operators.controller.js.map