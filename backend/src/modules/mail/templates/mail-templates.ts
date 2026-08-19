import { escapeHtml } from '../mail-escape.util';

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
  | 'password-reset';

type TemplateFn = (data: Record<string, unknown>) => string;

function field(data: Record<string, unknown>, key: string): string {
  return escapeHtml(String(data[key] ?? ''));
}

const TEMPLATES: Record<TemplateName, TemplateFn> = {
  'incident.created': (data) =>
    `<p>A new incident was reported.</p><p><strong>Title:</strong> ${field(data, 'title')}</p><p><strong>Description:</strong> ${field(data, 'description')}</p>`,
  'incident.assigned': (data) =>
    `<p>You have been assigned an incident.</p><p><strong>Title:</strong> ${field(data, 'title')}</p>`,
  'incident.status_changed': (data) =>
    `<p>An incident's status changed.</p><p><strong>Title:</strong> ${field(data, 'title')}</p><p><strong>New status:</strong> ${field(data, 'status')}</p>`,
  'comment.created': (data) =>
    `<p>A new comment was posted.</p><p><strong>Comment:</strong> ${field(data, 'content')}</p>`,
  // T3.6 — `link` already carries the token as part of a query string; it
  // is still passed through `field()` like every other interpolated value
  // (task 7.1: "the token string itself must be escaped via field() like
  // every other interpolated value").
  invitation: (data) =>
    `<p>You have been invited to join ${field(data, 'organizationName') || 'Transito Alerta SE'} as ${field(data, 'roleName')}.</p><p><a href="${field(data, 'link')}">Accept invitation</a></p><p>This link expires in 48 hours.</p>`,
  'password-reset': (data) =>
    `<p>A password reset was requested for your account.</p><p><a href="${field(data, 'link')}">Reset your password</a></p><p>This link expires in 24 hours. If you did not request this, you can ignore this email.</p>`,
};

/** Renders a named template's HTML body against escaped data. Throws for an unknown name (data defect, not retryable — D12). */
export function renderMailTemplate(name: TemplateName, data: Record<string, unknown>): string {
  const fn = TEMPLATES[name];
  if (!fn) {
    throw new Error(`Unknown mail template: ${String(name)}`);
  }
  return fn(data);
}
