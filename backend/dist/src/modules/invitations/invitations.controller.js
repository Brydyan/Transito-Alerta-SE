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
exports.InvitationsController = void 0;
const common_1 = require("@nestjs/common");
const require_permission_decorator_1 = require("../../common/decorators/require-permission.decorator");
const permission_guard_1 = require("../../common/guards/permission.guard");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const auth_service_1 = require("../auth/auth.service");
const accept_invitation_dto_1 = require("../auth/dto/accept-invitation.dto");
const create_invitation_dto_1 = require("./dto/create-invitation.dto");
const invitations_service_1 = require("./invitations.service");
function requestMeta(req) {
    return {
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
    };
}
let InvitationsController = class InvitationsController {
    constructor(invitationsService, authService) {
        this.invitationsService = invitationsService;
        this.authService = authService;
    }
    async invite(dto, req) {
        return this.invitationsService.createInvitation(req.user, {
            email: dto.email,
            roleId: dto.role_id,
            organizationId: dto.organization_id ?? null,
        });
    }
    async pending(req) {
        return this.invitationsService.listPending(req.user);
    }
    async preview(token) {
        return this.invitationsService.previewInvitation(token);
    }
    async previewByPath(token) {
        return this.invitationsService.previewInvitation(token);
    }
    async acceptInvitationAlias(dto, req) {
        const userId = await this.invitationsService.redeem(dto.token, dto.password, dto.terms_version);
        return this.authService.issueSessionForNewIdentity(userId, requestMeta(req));
    }
    async remove(id) {
        await this.invitationsService.deletePending(id);
    }
};
exports.InvitationsController = InvitationsController;
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('CREATE', 'invitations'),
    (0, common_1.Post)('admin/users/invite'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_invitation_dto_1.CreateInvitationDto, Object]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "invite", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('READ', 'invitations'),
    (0, common_1.Get)('invitations/pending'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "pending", null);
__decorate([
    (0, common_1.Get)('invitations/preview'),
    __param(0, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "preview", null);
__decorate([
    (0, common_1.Get)('invitations/:token/preview'),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "previewByPath", null);
__decorate([
    (0, common_1.Post)('invitations/accept'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [accept_invitation_dto_1.AcceptInvitationDto, Object]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "acceptInvitationAlias", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('DELETE', 'invitations'),
    (0, common_1.Delete)('invitations/:id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "remove", null);
exports.InvitationsController = InvitationsController = __decorate([
    (0, common_1.Controller)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => auth_service_1.AuthService))),
    __metadata("design:paramtypes", [invitations_service_1.InvitationsService,
        auth_service_1.AuthService])
], InvitationsController);
//# sourceMappingURL=invitations.controller.js.map