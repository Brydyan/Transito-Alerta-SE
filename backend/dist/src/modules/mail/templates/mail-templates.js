"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderMailTemplate = renderMailTemplate;
const mail_escape_util_1 = require("../mail-escape.util");
const mail_template_helpers_1 = require("./mail-template-helpers");
const product_name_1 = require("../product-name");
function field(data, key) {
    return (0, mail_escape_util_1.escapeHtml)(String(data[key] ?? ''));
}
function productFooter() {
    return `<p>— ${(0, mail_escape_util_1.escapeHtml)(product_name_1.PRODUCT_NAME)}</p>`;
}
const TEMPLATES = {
    'incident.created': (data) => `<p>A new incident was reported.</p><p><strong>Title:</strong> ${field(data, 'title')}</p><p><strong>Description:</strong> ${field(data, 'description')}</p>${productFooter()}`,
    'incident.assigned': (data) => `<p>You have been assigned an incident.</p><p><strong>Title:</strong> ${field(data, 'title')}</p>${productFooter()}`,
    'incident.status_changed': (data) => `<p>An incident's status changed.</p><p><strong>Title:</strong> ${field(data, 'title')}</p><p><strong>New status:</strong> ${field(data, 'status')}</p>${productFooter()}`,
    'comment.created': (data) => `<p>A new comment was posted.</p><p><strong>Comment:</strong> ${field(data, 'content')}</p>${productFooter()}`,
    invitation: (data) => `<p>You have been invited to join ${field(data, 'organizationName') || (0, mail_escape_util_1.escapeHtml)(product_name_1.PRODUCT_NAME)} as ${field(data, 'roleName')}.</p><p><a href="${field(data, 'link')}">Accept invitation</a></p><p>This link expires in 48 hours.</p>${productFooter()}`,
    'password-reset': (data) => `<p>A password reset was requested for your account.</p><p><a href="${field(data, 'link')}">Reset your password</a></p><p>This link expires in 24 hours. If you did not request this, you can ignore this email.</p>${productFooter()}`,
    'email_verification': (data) => `<p>Tu código de verificación es <strong>${field(data, 'otp')}</strong>.</p><p>Caduca en ${field(data, 'expiresMinutes')} minutos. Si no pediste este código, podés ignorar este correo.</p>${productFooter()}`,
    'existing_account_attempt': (data) => {
        const ip = data.ip;
        const userAgent = data.userAgent;
        const attemptedAt = data.attemptedAt;
        const safeIp = typeof ip === 'string' && ip.length > 0 ? ip : 'desconocida';
        const safeUa = typeof userAgent === 'string' && userAgent.length > 0 ? userAgent : 'desconocido';
        const masked = (0, mail_template_helpers_1.maskIp)(safeIp);
        const device = (0, mail_template_helpers_1.describeDevice)(safeUa);
        const when = attemptedAt instanceof Date
            ? (0, mail_template_helpers_1.formatAttemptTime)(attemptedAt)
            : typeof attemptedAt === 'string' && attemptedAt.length > 0
                ? (0, mail_template_helpers_1.formatAttemptTime)(new Date(attemptedAt))
                : 'desconocida';
        return (`<p>Alguien intentó crear una cuenta con tu correo.</p>` +
            `<table>` +
            `<tr><td><strong>Dispositivo</strong></td><td>${(0, mail_escape_util_1.escapeHtml)(device)}</td></tr>` +
            `<tr><td><strong>Dirección IP</strong></td><td>${(0, mail_escape_util_1.escapeHtml)(masked)}</td></tr>` +
            `<tr><td><strong>Cuándo</strong></td><td>${(0, mail_escape_util_1.escapeHtml)(when)}</td></tr>` +
            `</table>` +
            `<p>Si no fuiste vos, no te preocupes: nadie entró a tu cuenta ni cambió nada. ` +
            `Si suena alarmante, asusta a la gente por algo que no ocurrió.</p>` +
            productFooter());
    },
};
function renderMailTemplate(name, data) {
    const fn = TEMPLATES[name];
    if (!fn) {
        throw new Error(`Unknown mail template: ${String(name)}`);
    }
    return fn(data);
}
//# sourceMappingURL=mail-templates.js.map