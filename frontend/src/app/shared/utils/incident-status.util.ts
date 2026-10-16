/**
 * 2026-10-06-incident-images-read-path (D5) — single source of truth
 * for translating an incident-status key into the Spanish phrase the
 * project stores (per `ui-badge.token.ts` and `dashboard.tokens.ts`).
 *
 * Refactors `badgeStatusFor()` in `incident-detail.component.ts` —
 * before this change the same status map existed inline in the
 * detail component, and the timeline loop rendered raw English keys
 * (`pending`, `in_progress`, …). The detail component now delegates
 * to this function so badges and timelines can never diverge.
 *
 * Unknown keys (e.g. a future `closed` state or a legacy
 * `previous_status` from before the 4-state machine) gracefully
 * fallback to the raw string — `closed` falls back to its key
 * verbatim, which the timeline template renders unchanged.
 *
 * Status names are formatted with leading-cap (`'Pendiente'`,
 * `'En proceso'`, `'Resuelto'`, `'Cerrada'`) — matching the project's
 * Spanish tone and the canonical labels in the status badges.
 */
export function mapStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    in_progress: 'En proceso',
    resolved: 'Resuelto',
    closed: 'Cerrada',
  };
  return labels[status] ?? status;
}