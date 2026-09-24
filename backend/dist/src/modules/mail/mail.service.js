"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailService = exports.MAIL_DEAD_STREAM_KEY = exports.MAIL_OUTBOX_STREAM_KEY = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = __importStar(require("nodemailer"));
const core_module_1 = require("../../core/core.module");
const mail_templates_1 = require("./templates/mail-templates");
const product_name_1 = require("./product-name");
exports.MAIL_OUTBOX_STREAM_KEY = 'mail:outbox';
exports.MAIL_DEAD_STREAM_KEY = 'mail:dead';
let MailService = MailService_1 = class MailService {
    constructor(redis, configService) {
        this.redis = redis;
        this.configService = configService;
        this.logger = new common_1.Logger(MailService_1.name);
    }
    async enqueue(msg) {
        return this.redis.xadd(exports.MAIL_OUTBOX_STREAM_KEY, '*', 'to', msg.to, 'subject', msg.subject, 'template', msg.template, 'data', JSON.stringify(msg.data), 'attempts', '0');
    }
    renderTemplate(name, data) {
        return (0, mail_templates_1.renderMailTemplate)(name, data);
    }
    async deliver(to, subject, template, data) {
        const html = this.renderTemplate(template, data);
        await this.deliverViaSmtp(to, subject, html);
    }
    async deliverViaSmtp(to, subject, html) {
        const mailConfig = this.configService.get('mail');
        if (!mailConfig.smtpHost) {
            this.logger.log(`[log-only] mail to=${to} subject="${subject}"`);
            return;
        }
        const transport = nodemailer.createTransport({
            host: mailConfig.smtpHost,
            port: mailConfig.smtpPort,
            auth: mailConfig.smtpUser || mailConfig.smtpPassword
                ? { user: mailConfig.smtpUser, pass: mailConfig.smtpPassword }
                : undefined,
        });
        this.logger.log(`sending mail to=${to} subject="${subject}" host=${mailConfig.smtpHost}`);
        await transport.sendMail({
            to,
            subject,
            html,
            from: `${product_name_1.PRODUCT_NAME} <${mailConfig.smtpFrom}>`,
        });
    }
};
exports.MailService = MailService;
exports.MailService = MailService = MailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(core_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [Function, config_1.ConfigService])
], MailService);
//# sourceMappingURL=mail.service.js.map