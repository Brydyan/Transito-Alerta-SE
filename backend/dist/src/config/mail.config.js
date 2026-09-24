"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('mail', () => ({
    smtpHost: process.env.SMTP_HOST || undefined,
    smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    smtpUser: process.env.SMTP_USER || undefined,
    smtpPassword: process.env.SMTP_PASSWORD || undefined,
    smtpFrom: process.env.SMTP_FROM || 'no-reply@transito-alerta.example',
    sweepIntervalMs: process.env.MAIL_SWEEP_INTERVAL_MS
        ? parseInt(process.env.MAIL_SWEEP_INTERVAL_MS, 10)
        : 10_000,
    claimIdleMs: process.env.MAIL_CLAIM_IDLE_MS ? parseInt(process.env.MAIL_CLAIM_IDLE_MS, 10) : 30_000,
    maxAttempts: 3,
    appBaseUrl: process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000',
}));
//# sourceMappingURL=mail.config.js.map