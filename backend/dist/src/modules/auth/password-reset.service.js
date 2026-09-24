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
exports.PasswordResetService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const session_hash_1 = require("../../common/crypto/session-hash");
const mail_service_1 = require("../mail/mail.service");
const auth_service_1 = require("./auth.service");
const token_codec_1 = require("./token-codec");
const password_hasher_1 = require("./password-hasher");
const password_reset_repository_1 = require("./password-reset.repository");
const invitation_errors_1 = require("../invitations/invitation-errors");
const product_name_1 = require("../mail/product-name");
let PasswordResetService = class PasswordResetService {
    constructor(passwordResetRepository, userRepo, dataSource, passwordHasher, mailService, authService, configService) {
        this.passwordResetRepository = passwordResetRepository;
        this.userRepo = userRepo;
        this.dataSource = dataSource;
        this.passwordHasher = passwordHasher;
        this.mailService = mailService;
        this.authService = authService;
        this.configService = configService;
    }
    get mailConfig() {
        return this.configService.get('mail');
    }
    async requestReset(email) {
        const user = await this.userRepo.findOne({ where: { email } });
        if (!user) {
            return;
        }
        const token = (0, token_codec_1.generateToken)();
        const tokenHash = (0, session_hash_1.sha256Hex)(token);
        await this.passwordResetRepository.insert(user.id, tokenHash);
        await this.mailService.enqueue({
            to: email,
            subject: `Reset your ${product_name_1.PRODUCT_NAME} password`,
            template: 'password-reset',
            data: { link: `${this.mailConfig.appBaseUrl}/reset-password?token=${token}` },
        });
    }
    async confirmReset(token, newPassword) {
        const decoded = (0, token_codec_1.decodeTokenOrThrow)(token);
        const hash = (0, session_hash_1.sha256Hex)(decoded);
        const passwordHash = await this.passwordHasher.hash(newPassword);
        const userId = await this.dataSource.transaction(async (manager) => {
            const row = await this.passwordResetRepository.casConsume(hash, manager);
            if (!row) {
                const diagnosis = await this.passwordResetRepository.findDiagnosisByHash(hash);
                if (!diagnosis) {
                    throw new common_1.NotFoundException('Reset token not found');
                }
                if (diagnosis.used_at !== null) {
                    throw this.gone(invitation_errors_1.RESET_TOKEN_CONSUMED, 'Reset token already used');
                }
                throw this.gone(invitation_errors_1.RESET_TOKEN_EXPIRED, 'Reset token expired');
            }
            if (!(0, session_hash_1.timingSafeEqualHex)(hash, row.token_hash)) {
                throw new common_1.NotFoundException('Reset token not found');
            }
            await manager.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
                passwordHash,
                row.user_id,
            ]);
            return row.user_id;
        });
        await this.authService.revokeAllForUser(userId);
    }
    gone(code, message) {
        return new common_1.HttpException({ code, message }, common_1.HttpStatus.GONE);
    }
};
exports.PasswordResetService = PasswordResetService;
exports.PasswordResetService = PasswordResetService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(2, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [password_reset_repository_1.PasswordResetRepository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        password_hasher_1.PasswordHasher,
        mail_service_1.MailService,
        auth_service_1.AuthService,
        config_1.ConfigService])
], PasswordResetService);
//# sourceMappingURL=password-reset.service.js.map