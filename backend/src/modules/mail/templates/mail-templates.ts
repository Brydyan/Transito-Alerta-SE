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

/**
 * 2026-10-16-invitation-email-styled-template (D2) — formatea un
 * ISO timestamp a una cadena legible en español, en la zona horaria
 * de Ecuador (America/Guayaquil, UTC-5, sin horario de verano).
 *
 * Ejemplo: `formatExpiry('2026-10-15T23:59:00Z')` →
 *   `"15 de octubre de 2026 — 23:59 UTC-5"`
 *
 * Defensivo: si el input no es parseable, devuelve el input crudo
 * para que el cuerpo del correo no quede vacío (la capa que llama
 * ya hace `escapeHtml` por separado).
 */
function formatExpiry(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const dateStr = new Intl.DateTimeFormat('es-EC', {
      timeZone: 'America/Guayaquil',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
    const timeStr = new Intl.DateTimeFormat('es-EC', {
      timeZone: 'America/Guayaquil',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
    return `${dateStr} — ${timeStr} UTC-5`;
  } catch {
    return isoString;
  }
}

const TEMPLATES: Record<TemplateName, TemplateFn> = {
  'incident.created': (data) =>
    `<p>Se ha reportado un nuevo incidente.</p><p><strong>Título:</strong> ${field(data, 'title')}</p><p><strong>Descripción:</strong> ${field(data, 'description')}</p>${productFooter()}`,
  'incident.assigned': (data) =>
    `<p>Se te ha asignado un incidente.</p><p><strong>Título:</strong> ${field(data, 'title')}</p>${productFooter()}`,
  'incident.status_changed': (data) =>
    `<p>El estado de un incidente ha cambiado.</p><p><strong>Título:</strong> ${field(data, 'title')}</p><p><strong>Nuevo estado:</strong> ${field(data, 'status')}</p>${productFooter()}`,
  'comment.created': (data) =>
    `<p>Se ha publicado un nuevo comentario.</p><p><strong>Comentario:</strong> ${field(data, 'content')}</p>${productFooter()}`,
  // T3.6 — `link` already carries the token as part of a query string; it
  // is still passed through `field()` like every other interpolated value
  // (task 7.1: "the token string itself must be escaped via field() like
  // every other interpolated value").
  // H.4 (sc-330, D11) — el respaldo "Transito Alerta SE"
  // era el nombre del proyecto (TASE), no del producto. Pasa
  // a ser `PRODUCT_NAME` (GeoReporta). El renombrado toca
  // sólo lo que el usuario ve; `main.ts:77` (título de
  // Swagger) queda fuera de alcance por diseño.
  //
  // 2026-10-10-user-onboarding-telegram-tour (D6 / R3) — the staff
  // invitation email also ships a Telegram deep-link (`telegramLink`)
  // and a per-role mini-guide (`roleGuide`). The deep-link only
  // exists for staff roles; `reporter` invitations are not created
  // by this flow (D7), so the conditional below is defensive — if
  // `telegramLink` is missing, the section is skipped.
  //
  // 2026-10-16-invitation-email-styled-template (D2) — el template
  // pasa de un fragmento sin layout a un documento HTML completo
  // (`<!DOCTYPE html>`) con estilos inline (clientes como Outlook
  // y Gmail descartan <style>; el inline garantiza que el correo
  // llegue igual en cualquier cliente). El saludo se personaliza con
  // `recipientFirstName` cuando hay uno, y la tarjeta de detalles
  // incluye `inviterName`, la organización y la expiración absoluta
  // (formateada con `formatExpiry` a la zona horaria de Ecuador).
  // Todos los valores de usuario pasan por `escapeHtml()` o
  // `field()` (R13) — la regla no se relaja en esta reescritura.
  invitation: (data) => {
    const productName = escapeHtml(PRODUCT_NAME);
    const roleName = field(data, 'roleName');
    const orgName = data['organizationName']
      ? escapeHtml(String(data['organizationName']))
      : '';
    const inviterName = data['inviterName']
      ? escapeHtml(String(data['inviterName']))
      : 'El administrador';
    const firstName = data['recipientFirstName']
      ? escapeHtml(String(data['recipientFirstName']))
      : '';
    const recipEmail = field(data, 'recipientEmail');
    const link = field(data, 'link');
    const expiresRaw = data['expiresAt'] ? String(data['expiresAt']) : '';
    const expiryStr = expiresRaw ? escapeHtml(formatExpiry(expiresRaw)) : '';

    const rawTgLink = data['telegramLink'] ? String(data['telegramLink']) : '';
    const safeTgLink = rawTgLink ? escapeHtml(rawTgLink) : '';
    const roleGuide = data['roleGuide'] ? String(data['roleGuide']) : '';

    const greeting = firstName ? `Hola, ${firstName} 👋` : 'Hola 👋';
    const bodyText = orgName
      ? `${inviterName} te invitó a unirte al equipo de <strong>${orgName}</strong> como <strong>${roleName}</strong>. Acepta la invitación dentro de las próximas 48 horas para configurar tu contraseña y empezar a gestionar incidencias.`
      : `${inviterName} te invitó a unirte como <strong>${roleName}</strong>. Acepta la invitación dentro de las próximas 48 horas para configurar tu contraseña y empezar a gestionar incidencias.`;

    const cardOrgRow = orgName
      ? `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;width:130px;vertical-align:top">
            <span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Organización</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #E5E7EB">
            <span style="font-size:14px;color:#111827;font-weight:500">${orgName}</span>
          </td>
        </tr>`
      : '';

    const cardExpiryRow = expiryStr
      ? `
        <tr>
          <td style="padding:10px 0;width:130px;vertical-align:top">
            <span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Expira</span>
          </td>
          <td style="padding:10px 0">
            <span style="font-size:14px;color:#111827;font-weight:500">${expiryStr}</span>
          </td>
        </tr>`
      : '';

    const telegramSection = safeTgLink
      ? `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;background-color:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px">
        <tr>
          <td style="padding:24px">
            <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#5B21B6">📱 Paso 2: Activa las notificaciones en Telegram</p>
            <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5">Recibirás las incidencias asignadas y alertas operativas directamente en Telegram. Haz clic en el botón, abre el chat con el bot y presiona <strong>Iniciar</strong>.</p>
            <a href="${safeTgLink}" style="display:inline-block;background-color:#5B21B6;color:#FFFFFF;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600">Iniciar bot de Telegram</a>
            <p style="margin:12px 0 0;font-size:12px;color:#6B7280">Este enlace expira en 24 horas. Puedes generar uno nuevo desde tu perfil en la plataforma.</p>
          </td>
        </tr>
      </table>`
      : '';

    const roleGuideSection = roleGuide
      ? `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px">
        <tr>
          <td style="padding:20px 24px">
            <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#374151">Lo que harás como ${roleName}</p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap">${escapeHtml(roleGuide)}</p>
          </td>
        </tr>
      </table>`
      : '';

    return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Invitación a ${productName}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F4F6;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:8px;overflow:hidden">

        <!-- Header -->
        <tr>
          <td style="background-color:#7C3AED;text-align:center;padding:32px 40px">
            <p style="margin:0;font-size:28px;font-weight:700;color:#FFFFFF;letter-spacing:0.05em">${productName}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#DDD6FE">Sistema de gestión de incidencias de tránsito</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px">
            <p style="margin:0 0 8px;font-size:16px;color:#374151">${greeting}</p>
            <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;line-height:1.3">Te invitaron a unirte a ${productName}</h1>
            <p style="margin:0 0 32px;font-size:15px;color:#374151;line-height:1.6">${bodyText}</p>

            <!-- Details card -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:32px">
              <tr>
                <td style="padding:20px 24px">
                  <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#374151">Detalles de la invitación</p>
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;width:130px;vertical-align:top">
                        <span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Invitado por</span>
                      </td>
                      <td style="padding:10px 0;border-bottom:1px solid #E5E7EB">
                        <span style="font-size:14px;color:#111827;font-weight:500">${inviterName}</span>
                      </td>
                    </tr>
                    ${cardOrgRow}
                    <tr>
                      <td style="padding:10px 0;border-bottom:${expiryStr ? '1px solid #E5E7EB' : 'none'};width:130px;vertical-align:top">
                        <span style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em">Rol</span>
                      </td>
                      <td style="padding:10px 0;border-bottom:${expiryStr ? '1px solid #E5E7EB' : 'none'}">
                        <span style="font-size:14px;color:#111827;font-weight:500">${roleName}</span>
                      </td>
                    </tr>
                    ${cardExpiryRow}
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px">
              <tr>
                <td style="border-radius:8px;background-color:#7C3AED">
                  <a href="${link}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:600;border-radius:8px">Aceptar invitación</a>
                </td>
              </tr>
            </table>

            <!-- Fallback URL -->
            <p style="margin:0;font-size:13px;color:#6B7280">Si el botón no funciona, copia este enlace en tu navegador:</p>
            <p style="margin:4px 0 0;font-size:13px;word-break:break-all"><a href="${link}" style="color:#7C3AED;text-decoration:none">${link}</a></p>

            ${telegramSection}
            ${roleGuideSection}
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid #E5E7EB;font-size:0;line-height:0">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px">
            <p style="margin:0 0 8px;font-size:13px;color:#6B7280">Este correo fue enviado a ${recipEmail}.</p>
            <p style="margin:0 0 16px;font-size:13px;color:#6B7280;line-height:1.5">Si no esperabas esta invitación puedes ignorar este mensaje. La invitación caduca automáticamente y tu dirección no será agregada al sistema.</p>
            <p style="margin:0;font-size:12px;color:#9CA3AF">${productName} · Sistema de gestión de incidencias de tránsito</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
  </body>
  </html>`;
  },
  'password-reset': (data) =>
    `<p>Se solicitó un restablecimiento de contraseña para tu cuenta.</p><p><a href="${field(data, 'link')}">Restablecer contraseña</a></p><p>Este enlace expira en 24 horas. Si no lo solicitaste, puedes ignorar este correo.</p>${productFooter()}`,
  // MAIL A.2 — la verificación de cuenta. Datos: { otp, expiresMinutes }.
  // El OTP sale por `field()` como cualquier otro valor (R13).
  'email_verification': (data) =>
    `<p>Tu código de verificación es <strong>${field(data, 'otp')}</strong>.</p><p>Caduca en ${field(data, 'expiresMinutes')} minutos. Si no pediste este código, puedes ignorar este correo.</p>${productFooter()}`,
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
      `<p>Si no fuiste tú, no te preocupes: nadie entró a tu cuenta ni cambió nada. ` +
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
// la unión no compila. El test que vivía acá (C.2 de sc-330) era
// una tautología que enforzaba al runtime lo que el compilador ya
// garantiza.
//
// El caso que el compilador NO puede ver — una entrada que llega desde
// Redis con un nombre que ya no existe en el union — está cubierto por
// `mail-outbox.consumer.spec.ts` ('sends an unknown template straight to
// mail:dead'), que es donde el nombre entra como dato y la comprobación
// runtime sirve de algo. Esa es la costura real de este módulo, no la
// que el C.2 afirmaba recorrer.
