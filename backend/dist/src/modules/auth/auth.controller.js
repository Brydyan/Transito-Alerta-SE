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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const invitations_service_1 = require("../invitations/invitations.service");
const auth_service_1 = require("./auth.service");
const auth_register_1 = require("./auth.register");
const credential_dispatch_1 = require("./credential-dispatch");
const accept_invitation_dto_1 = require("./dto/accept-invitation.dto");
const change_password_dto_1 = require("./dto/change-password.dto");
const login_dto_1 = require("./dto/login.dto");
const password_reset_confirm_dto_1 = require("./dto/password-reset-confirm.dto");
const password_reset_request_dto_1 = require("./dto/password-reset-request.dto");
const register_dto_1 = require("./dto/register.dto");
const refresh_dto_1 = require("./dto/refresh.dto");
const auth_errors_1 = require("./auth-errors");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const password_reset_service_1 = require("./password-reset.service");
function requestMeta(req) {
    return {
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
    };
}
let AuthController = class AuthController {
    constructor(authService, authRegisterService, invitationsService, passwordResetService) {
        this.authService = authService;
        this.authRegisterService = authRegisterService;
        this.invitationsService = invitationsService;
        this.passwordResetService = passwordResetService;
    }
    async register(dto, req) {
        try {
            const result = await this.authRegisterService.register({
                email: dto.email,
                password: dto.password,
                firstName: dto.first_name,
                lastName: dto.last_name,
                ip: req.ip ?? null,
                userAgent: req.headers['user-agent'] ?? null,
            });
            return result.publicMessage;
        }
        catch (err) {
            if (err instanceof auth_register_1.RegistrationRateLimited) {
                throw new common_1.HttpException({
                    code: auth_errors_1.REGISTRATION_RATE_LIMITED,
                    message: `Demasiados intentos. Probá en una hora.`,
                }, common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
            throw err;
        }
    }
    async login(dto, req) {
        const credential = (0, credential_dispatch_1.resolveCredential)(dto);
        if (credential.kind === 'device') {
            return this.authService.login(credential.deviceUuid, requestMeta(req));
        }
        return this.authService.loginWithPassword({ email: credential.email, password: credential.password, deviceUuid: credential.deviceUuid }, requestMeta(req));
    }
    async refresh(dto, req) {
        return this.authService.refresh(dto.refresh_token, requestMeta(req));
    }
    async acceptInvitation(dto, req) {
        const userId = await this.invitationsService.redeem(dto.token, dto.password, dto.terms_version);
        return this.authService.issueSessionForNewIdentity(userId, requestMeta(req));
    }
    async passwordReset(dto) {
        await this.passwordResetService.requestReset(dto.email);
    }
    async passwordResetConfirm(dto) {
        await this.passwordResetService.confirmReset(dto.token, dto.password);
    }
    async changePassword(dto, req) {
        const userId = req.user.userId;
        await this.authService.changePassword(userId, dto.current_password, dto.new_password);
    }
    async me(req) {
        const userId = req.user.userId;
        const { deviceUuid, permissions, email_verified, role_name } = await this.authService.getMe(userId);
        const permission_names = permissions;
        return {
            user_id: userId,
            device_uuid: deviceUuid,
            permissions,
            permission_names,
            email_verified,
            role_name,
        };
    }
    async logout(req) {
        const sessionId = req.user.sessionId;
        if (sessionId) {
            await this.authService.revokeSession(sessionId);
        }
        return { success: true };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_dto_1.RefreshDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('accept-invitation'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [accept_invitation_dto_1.AcceptInvitationDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "acceptInvitation", null);
__decorate([
    (0, common_1.Post)('password-reset'),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [password_reset_request_dto_1.PasswordResetRequestDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "passwordReset", null);
__decorate([
    (0, common_1.Post)('password-reset/confirm'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [password_reset_confirm_dto_1.PasswordResetConfirmDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "passwordResetConfirm", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Put)('password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [change_password_dto_1.ChangePasswordDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        auth_register_1.AuthRegisterService,
        invitations_service_1.InvitationsService,
        password_reset_service_1.PasswordResetService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map