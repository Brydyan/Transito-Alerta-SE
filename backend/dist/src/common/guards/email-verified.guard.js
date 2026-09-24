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
var EmailVerifiedGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailVerifiedGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const auth_errors_1 = require("../../modules/auth/auth-errors");
let EmailVerifiedGuard = EmailVerifiedGuard_1 = class EmailVerifiedGuard {
    constructor(reflector, userRepo) {
        this.reflector = reflector;
        this.userRepo = userRepo;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user) {
            throw new common_1.ForbiddenException({
                code: auth_errors_1.EMAIL_VERIFICATION_REQUIRED,
                message: 'Necesitás iniciar sesión para realizar esta acción.',
            });
        }
        if (user.isAnonymous === true) {
            return true;
        }
        if (user.roleName && EmailVerifiedGuard_1.STAFF_ROLES.has(user.roleName)) {
            return true;
        }
        const dbUser = await this.userRepo.findOne({
            where: { id: user.userId },
            select: ['id', 'emailVerifiedAt'],
        });
        if (!dbUser || !dbUser.emailVerifiedAt) {
            throw new common_1.ForbiddenException({
                code: auth_errors_1.EMAIL_VERIFICATION_REQUIRED,
                message: 'Necesitás verificar tu correo antes de publicar. Revisá tu bandeja.',
            });
        }
        return true;
    }
};
exports.EmailVerifiedGuard = EmailVerifiedGuard;
EmailVerifiedGuard.STAFF_ROLES = new Set([
    'operador_org',
    'admin_org',
    'operador_sistema',
    'master',
]);
exports.EmailVerifiedGuard = EmailVerifiedGuard = EmailVerifiedGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [core_1.Reflector,
        typeorm_2.Repository])
], EmailVerifiedGuard);
//# sourceMappingURL=email-verified.guard.js.map