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
var AuthRegisterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRegisterService = exports.REGISTRATION_INDISTINGUISHABLE_MESSAGE = exports.RegistrationRateLimited = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const role_entity_1 = require("../../entities/role.entity");
const password_hasher_1 = require("./password-hasher");
const email_verification_service_1 = require("./email-verification.service");
const DUMMY_PASSWORD_FOR_TIMING = 'timing-equalization-dummy-password-12+chars';
class RegistrationRateLimited extends Error {
    constructor(scope) {
        super(`Registration rate-limited by ${scope}`);
        this.scope = scope;
    }
}
exports.RegistrationRateLimited = RegistrationRateLimited;
exports.REGISTRATION_INDISTINGUISHABLE_MESSAGE = 'Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta.';
let AuthRegisterService = AuthRegisterService_1 = class AuthRegisterService {
    constructor(userRepo, roleRepo, passwordHasher, emailVerificationService, dataSource) {
        this.userRepo = userRepo;
        this.roleRepo = roleRepo;
        this.passwordHasher = passwordHasher;
        this.emailVerificationService = emailVerificationService;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(AuthRegisterService_1.name);
        this.WINDOW_MS = 60 * 60 * 1000;
        this.IP_MAX = 5;
        this.EMAIL_MAX = 3;
        this.ipStore = new Map();
        this.emailStore = new Map();
    }
    async register(input) {
        const emailLower = input.email.toLowerCase().trim();
        this.assertRateLimit('ip', input.ip);
        this.assertRateLimit('email', emailLower);
        const existing = await this.userRepo.findOne({
            where: { email: emailLower },
        });
        if (existing) {
            await this.passwordHasher.hash(DUMMY_PASSWORD_FOR_TIMING);
            await this.emailVerificationService.notifyExistingAccountAttempt(existing.id, input.ip, input.userAgent, new Date());
            this.registerEmailHit(emailLower);
            this.registerIpHit(input.ip);
            this.logger.log(`Register attempt on existing email: ${emailLower} (ip=${input.ip ?? 'unknown'})`);
            return {
                success: true,
                userId: existing.id,
                publicMessage: {
                    message: exports.REGISTRATION_INDISTINGUISHABLE_MESSAGE,
                },
            };
        }
        const reporterRole = await this.roleRepo.findOne({
            where: { name: 'reporter' },
        });
        if (!reporterRole) {
            this.logger.error('Register: rol `reporter` no encontrado en la tabla `roles`. Aplicar 0009 + 0040.');
            return {
                success: true,
                userId: '',
                publicMessage: {
                    message: exports.REGISTRATION_INDISTINGUISHABLE_MESSAGE,
                },
            };
        }
        this.passwordHasher.assertStrongEnough(input.password);
        const passwordHash = await this.passwordHasher.hash(input.password);
        const created = await this.dataSource.transaction(async (manager) => {
            const user = manager.create(user_entity_1.UserEntity, {
                email: emailLower,
                passwordHash,
                firstName: input.firstName,
                lastName: input.lastName,
                deviceUuid: null,
                roleId: reporterRole.id,
                permissions: reporterRole.permissions ?? [],
                permissionVersion: 1,
                isActive: true,
            });
            return manager.save(user);
        });
        try {
            await this.emailVerificationService.generateAndSendOtp(created.id);
        }
        catch (err) {
            this.logger.warn(`Register: OTP no emitido para ${emailLower} (cuenta creada, id=${created.id}): ${err.message}`);
        }
        this.registerEmailHit(emailLower);
        this.registerIpHit(input.ip);
        return {
            success: true,
            userId: created.id,
            publicMessage: {
                message: exports.REGISTRATION_INDISTINGUISHABLE_MESSAGE,
            },
        };
    }
    assertRateLimit(scope, key) {
        if (!key)
            return;
        const now = Date.now();
        const store = scope === 'ip' ? this.ipStore : this.emailStore;
        const max = scope === 'ip' ? this.IP_MAX : this.EMAIL_MAX;
        const hits = (store.get(key) ?? []).filter((t) => now - t < this.WINDOW_MS);
        if (hits.length >= max) {
            throw new RegistrationRateLimited(scope);
        }
    }
    registerIpHit(ip) {
        if (!ip)
            return;
        const hits = (this.ipStore.get(ip) ?? []).filter((t) => Date.now() - t < this.WINDOW_MS);
        hits.push(Date.now());
        this.ipStore.set(ip, hits);
    }
    registerEmailHit(email) {
        const hits = (this.emailStore.get(email) ?? []).filter((t) => Date.now() - t < this.WINDOW_MS);
        hits.push(Date.now());
        this.emailStore.set(email, hits);
    }
};
exports.AuthRegisterService = AuthRegisterService;
exports.AuthRegisterService = AuthRegisterService = AuthRegisterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(role_entity_1.RoleEntity)),
    __param(4, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        password_hasher_1.PasswordHasher,
        email_verification_service_1.EmailVerificationService,
        typeorm_2.DataSource])
], AuthRegisterService);
//# sourceMappingURL=auth.register.js.map