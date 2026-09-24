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
exports.IncidentSocialController = void 0;
const common_1 = require("@nestjs/common");
const incident_social_service_1 = require("./incident-social.service");
const require_permission_decorator_1 = require("../../common/decorators/require-permission.decorator");
const permission_guard_1 = require("../../common/guards/permission.guard");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let IncidentSocialController = class IncidentSocialController {
    constructor(socialService) {
        this.socialService = socialService;
    }
    async follow(incidentId, req) {
        if (!req.user)
            throw new common_1.UnauthorizedException('Session missing');
        await this.socialService.follow(incidentId, req.user.userId);
    }
    async unfollow(incidentId, req) {
        if (!req.user)
            throw new common_1.UnauthorizedException('Session missing');
        await this.socialService.unfollow(incidentId, req.user.userId);
    }
    async corroborate(incidentId, req, comment) {
        if (!req.user)
            throw new common_1.UnauthorizedException('Session missing');
        await this.socialService.corroborate(incidentId, req.user.userId, comment);
    }
};
exports.IncidentSocialController = IncidentSocialController;
__decorate([
    (0, common_1.Post)('followers'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permission_decorator_1.RequirePermission)('CREATE', 'incident-followers'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], IncidentSocialController.prototype, "follow", null);
__decorate([
    (0, common_1.Delete)('followers'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, require_permission_decorator_1.RequirePermission)('DELETE', 'incident-followers'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], IncidentSocialController.prototype, "unfollow", null);
__decorate([
    (0, common_1.Post)('corroborations'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, require_permission_decorator_1.RequirePermission)('CREATE', 'incident-corroborations'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)('comment')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], IncidentSocialController.prototype, "corroborate", null);
exports.IncidentSocialController = IncidentSocialController = __decorate([
    (0, common_1.Controller)('incidents/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [incident_social_service_1.IncidentSocialService])
], IncidentSocialController);
//# sourceMappingURL=incident-social.controller.js.map