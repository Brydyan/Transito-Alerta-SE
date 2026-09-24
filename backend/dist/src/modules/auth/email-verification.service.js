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
var EmailVerificationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailVerificationService = void 0;
const crypto_1 = require("crypto");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const mail_service_1 = require("../mail/mail.service");
const auth_errors_1 = require("./auth-errors");
function sha256Hex(otp) {
    return (0, crypto_1.createHash)('sha256').update(otp).digest('hex');
}
let EmailVerificationService = EmailVerificationService_1 = class EmailVerificationService {
    constructor(userRepo, mailService) {
        this.userRepo = userRepo;
        this.mailService = mailService;
        this.logger = new common_1.Logger(EmailVerificationService_1.name);
    }
    async notifyExistingAccountAttempt(userId, ip, userAgent, attemptedAt = new Date()) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user || !user.email)
            return;
        await this.mailService.enqueue({
            to: user.email,
            subject: 'Se intentó crear una cuenta con tu correo',
            template: 'existing_account_attempt',
            data: {
                ip: ip ?? 'desconocida',
                userAgent: userAgent ?? 'desconocido',
                attemptedAt: attemptedAt.toISOString(),
            },
        });
    }
    assertRateLimit(user) {
        if (user.verificationOtpExpiresAt) {
            const issuedAt = new Date(user.verificationOtpExpiresAt.getTime() - 15 * 60 * 1000);
            const secondsSinceIssuance = (Date.now() - issuedAt.getTime()) / 1000;
            if (secondsSinceIssuance < 60) {
                throw new common_1.HttpException({ message: 'OTP was recently issued. Please wait 60 seconds before requesting a new one.' }, common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
        }
    }
    async generateAndSendOtp(userId) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.UnprocessableEntityException({
                code: auth_errors_1.OTP_INVALID,
                message: 'Cannot send verification email',
            });
        }
        if (user.emailVerifiedAt) {
            throw new common_1.UnprocessableEntityException({
                code: auth_errors_1.EMAIL_ALREADY_VERIFIED,
                message: 'Email is already verified',
            });
        }
        this.assertRateLimit(user);
        const otp = String((0, crypto_1.randomInt)(100000, 999999));
        const otpHash = sha256Hex(otp);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await this.userRepo.update(userId, {
            verificationOtp: otpHash,
            verificationOtpExpiresAt: expiresAt,
        });
        if (user.email) {
            await this.mailService.enqueue({
                to: user.email,
                subject: 'Your email verification code',
                template: 'email_verification',
                data: { otp, expiresMinutes: 15 },
            });
        }
        else {
            this.logger.warn(`User ${userId} has no email address; OTP generated but not sent`);
        }
    }
    async verifyOtp(userId, otp) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.UnprocessableEntityException({
                code: auth_errors_1.OTP_INVALID,
                message: 'Invalid OTP',
            });
        }
        if (user.emailVerifiedAt) {
            throw new common_1.UnprocessableEntityException({
                code: auth_errors_1.EMAIL_ALREADY_VERIFIED,
                message: 'Email is already verified',
            });
        }
        if (!user.verificationOtp || !user.verificationOtpExpiresAt) {
            throw new common_1.UnprocessableEntityException({
                code: auth_errors_1.OTP_INVALID,
                message: 'No pending OTP for this account',
            });
        }
        if (user.verificationOtpExpiresAt < new Date()) {
            throw new common_1.UnprocessableEntityException({
                code: auth_errors_1.OTP_INVALID,
                message: 'OTP has expired',
            });
        }
        const expectedHash = user.verificationOtp;
        const providedHash = sha256Hex(otp);
        if (expectedHash !== providedHash) {
            throw new common_1.UnprocessableEntityException({
                code: auth_errors_1.OTP_INVALID,
                message: 'Invalid OTP',
            });
        }
        await this.userRepo.update(userId, {
            emailVerifiedAt: new Date(),
            verificationOtp: null,
            verificationOtpExpiresAt: null,
        });
    }
};
exports.EmailVerificationService = EmailVerificationService;
exports.EmailVerificationService = EmailVerificationService = EmailVerificationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        mail_service_1.MailService])
], EmailVerificationService);
//# sourceMappingURL=email-verification.service.js.map