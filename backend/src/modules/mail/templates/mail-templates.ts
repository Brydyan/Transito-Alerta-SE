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
  | 'comment.created';

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
};

/** Renders a named template's HTML body against escaped data. Throws for an unknown name (data defect, not retryable — D12). */
export function renderMailTemplate(name: TemplateName, data: Record<string, unknown>): string {
  const fn = TEMPLATES[name];
  if (!fn) {
    throw new Error(`Unknown mail template: ${String(name)}`);
  }
  return fn(data);
}
