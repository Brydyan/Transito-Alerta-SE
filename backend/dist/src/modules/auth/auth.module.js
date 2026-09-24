"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const typeorm_1 = require("@nestjs/typeorm");
const user_entity_1 = require("../../entities/user.entity");
const role_entity_1 = require("../../entities/role.entity");
const invitations_module_1 = require("../invitations/invitations.module");
const mail_module_1 = require("../mail/mail.module");
const sessions_module_1 = require("../sessions/sessions.module");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const auth_register_1 = require("./auth.register");
const email_verification_controller_1 = require("./email-verification.controller");
const email_verification_service_1 = require("./email-verification.service");
const jwt_strategy_1 = require("./jwt.strategy");
const password_hasher_1 = require("./password-hasher");
const password_reset_repository_1 = require("./password-reset.repository");
const password_reset_service_1 = require("./password-reset.service");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([user_entity_1.UserEntity, role_entity_1.RoleEntity]),
            passport_1.PassportModule.register({ defaultStrategy: 'jwt' }),
            jwt_1.JwtModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => {
                    const authConfig = config.get('auth');
                    return {
                        secret: authConfig.jwtAccessSecret,
                        signOptions: { expiresIn: authConfig.jwtAccessExpiresIn },
                    };
                },
            }),
            sessions_module_1.SessionsModule,
            (0, common_1.forwardRef)(() => invitations_module_1.InvitationsModule),
            mail_module_1.MailModule,
        ],
        controllers: [auth_controller_1.AuthController, email_verification_controller_1.EmailVerificationController],
        providers: [
            auth_service_1.AuthService,
            auth_register_1.AuthRegisterService,
            jwt_strategy_1.JwtStrategy,
            password_hasher_1.PasswordHasher,
            password_reset_repository_1.PasswordResetRepository,
            password_reset_service_1.PasswordResetService,
            email_verification_service_1.EmailVerificationService,
        ],
        exports: [auth_service_1.AuthService, auth_register_1.AuthRegisterService, jwt_1.JwtModule],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map