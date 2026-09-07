import { escapeHtml } from '../mail-escape.util';
import { formatAttemptTime, maskIp, describeDevice } from './mail-template-helpers';
import { PRODUCT_NAME } from '../product-name';

/**
 * Typed inline templates (design D9) — no template engine. Each entry is a
 * pure function of already-escaped data, so a poisoned `{{variable}}` can
 * never reach an email body unescaped (R13). Templates render the HTML
 * body only; the subject line is supplied by the caller as part of
 * `OutboundMail` (design D9's `enqueue(msg: OutboundMail)` signature) —
 * these four routing decisions live in `IncidentMailListener`, not here.
 */
export type TemplateName =
  | 'incident.created'
  | 'incident.assigned'
  | 'incident.status_changed'
  | 'comment.created'
  | 'invitation'
  | 'password-reset'
  // MAIL (sc-327 — sprint MAIL): REG cerró `email_verification` y
  // `existing_account_attempt` con `'… as never'`, apagando el único
  // control automático del compilador. Esta fase los añade a la
  // unión; los `as never` salen en la misma ronda (B.1/B.2).
  | 'email_verification'
  | 'existing_account_attempt';

type TemplateFn = (data: Record<string, unknown>) => string;

function field(data: Record<string, unknown>, key: string): string {
  return escapeHtml(String(data[key] ?? ''));
}

/** Pie común (D11): todas las plantillas terminan identificando a
 * la aplicación. El nombre sale de la constante `PRODUCT_NAME`,
 * nunca escrito a mano, para que un cambio de marca se aplique
 * a las 8 plantillas con un solo punto de edición. */
function productFooter(): string {
  return `<p>— ${escapeHtml(PRODUCT_NAME)}</p>`;
}

const TEMPLATES: Record<TemplateName, TemplateFn> = {
  'incident.created': (data) =>
    `<p>A new incident was reported.</p><p><strong>Title:</strong> ${field(data, 'title')}</p><p><strong>Description:</strong> ${field(data, 'description')}</p>${productFooter()}`,
  'incident.assigned': (data) =>
    `<p>You have been assigned an incident.</p><p><strong>Title:</strong> ${field(data, 'title')}</p>${productFooter()}`,
  'incident.status_changed': (data) =>
    `<p>An incident's status changed.</p><p><strong>Title:</strong> ${field(data, 'title')}</p><p><strong>New status:</strong> ${field(data, 'status')}</p>${productFooter()}`,
  'comment.created': (data) =>
    `<p>A new comment was posted.</p><p><strong>Comment:</strong> ${field(data, 'content')}</p>${productFooter()}`,
  // T3.6 — `link` already carries the token as part of a query string; it
  // is still passed through `field()` like every other interpolated value
  // (task 7.1: "the token string itself must be escaped via field() like
  // every other interpolated value").
  // H.4 (ronda 14, D11) — el respaldo "Transito Alerta SE"
  // era el nombre del proyecto (TASE), no del producto. Pasa
  // a ser `PRODUCT_NAME` (GeoReporta). El renombrado toca
  // sólo lo que el usuario ve; `main.ts:77` (título de
  // Swagger) queda fuera de alcance por diseño.
  invitation: (data) =>
    `<p>You have been invited to join ${field(data, 'organizationName') || escapeHtml(PRODUCT_NAME)} as ${field(data, 'roleName')}.</p><p><a href="${field(data, 'link')}">Accept invitation</a></p><p>This link expires in 48 hours.</p>${productFooter()}`,
  'password-reset': (data) =>
    `<p>A password reset was requested for your account.</p><p><a href="${field(data, 'link')}">Reset your password</a></p><p>This link expires in 24 hours. If you did not request this, you can ignore this email.</p>${productFooter()}`,
  // MAIL A.2 — la verificación de cuenta. Datos: { otp, expiresMinutes }.
  // El OTP sale por `field()` como cualquier otro valor (R13).
  'email_verification': (data) =>
    `<p>Tu código de verificación es <strong>${field(data, 'otp')}</strong>.</p><p>Caduca en ${field(data, 'expiresMinutes')} minutos. Si no pediste este código, podés ignorar este correo.</p>${productFooter()}`,
  // MAIL A.2/D4/D9 — el aviso de intento sobre cuenta existente.
  // Sin OTP y sin enlace (D4). Tres campos, todos recortados (D9):
  // dispositivo sin versiones, IP enmascarada a dos octetos,
  // hora local en America/Guayaquil. Cada valor pasa por `field()`
  // (R13). El cierre dice explícitamente que no hay nada que
  // hacer, para que el titular no se asuste por un intento
  // que no prosperó.
  'existing_account_attempt': (data) => {
    const ip = data.ip;
    const userAgent = data.userAgent;
    const attemptedAt = data.attemptedAt;
    const safeIp = typeof ip === 'string' && ip.length > 0 ? ip : 'desconocida';
    const safeUa = typeof userAgent === 'string' && userAgent.length > 0 ? userAgent : 'desconocido';
    const masked = maskIp(safeIp);
    const device = describeDevice(safeUa);
    const when = attemptedAt instanceof Date
      ? formatAttemptTime(attemptedAt)
      : typeof attemptedAt === 'string' && attemptedAt.length > 0
        ? formatAttemptTime(new Date(attemptedAt))
        : 'desconocida';
    return (
      `<p>Alguien intentó crear una cuenta con tu correo.</p>` +
      `<table>` +
      `<tr><td><strong>Dispositivo</strong></td><td>${escapeHtml(device)}</td></tr>` +
      `<tr><td><strong>Dirección IP</strong></td><td>${escapeHtml(masked)}</td></tr>` +
      `<tr><td><strong>Cuándo</strong></td><td>${escapeHtml(when)}</td></tr>` +
      `</table>` +
      `<p>Si no fuiste vos, no te preocupes: nadie entró a tu cuenta ni cambió nada. ` +
      `Si suena alarmante, asusta a la gente por algo que no ocurrió.</p>` +
      productFooter()
    );
  },
};

/** Renders a named template's HTML body against escaped data. Throws for an unknown name (data defect, not retryable — D12). */
export function renderMailTemplate(name: TemplateName, data: Record<string, unknown>): string {
  const fn = TEMPLATES[name];
  if (!fn) {
    throw new Error(`Unknown mail template: ${String(name)}`);
  }
  return fn(data);
}

// La cobertura del registro `TEMPLATES` está garantizada por el sistema
// de tipos: `Record<TemplateName, TemplateFn>` exige que CADA miembro de
// la unión `TemplateName` tenga una entrada, y un nombre que no esté en
// la unión no compila. El test que vivía acá (C.2 de la ronda 14) era
// una tautología que enforzaba al runtime lo que el compilador ya
// garantiza.
//
// El caso que el compilador NO puede ver — una entrada que llega desde
// Redis con un nombre que ya no existe en el union — está cubierto por
// `mail-outbox.consumer.spec.ts` ('sends an unknown template straight to
// mail:dead'), que es donde el nombre entra como dato y la comprobación
// runtime sirve de algo. Esa es la costura real de este módulo, no la
// que el C.2 afirmaba recorrer.
