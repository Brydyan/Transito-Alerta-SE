/**
 * Deep-link builder for the Telegram messages (F7 emergency-dispatch).
 *
 * 2026-10-20 — DRIFT FIX.
 *
 * Three call sites were building the detail link by hand as
 * `${appBaseUrl}/incidents/${incidentId}`:
 *
 *   - `listeners/incident-assigned.listener.ts`  (operator notified on assign)
 *   - `listeners/critical-incident.listener.ts`  (admins notified on create)
 *   - `telegram-reminder.scheduler.ts`            (unattended-case reminder)
 *
 * That path does not exist. The Angular route tree is
 * `path: 'app'` (behind `authGuard`, app.routes.ts:104) → `path: 'incidencias'`
 * (line 357) → `path: ':id'` (line 369), so the real URL is
 * `/app/incidencias/:id`. Every Telegram message carried a 404.
 *
 * Duplicating the literal in three places is how it drifted in the first
 * place — the route moved and none of them moved with it. One builder, one
 * place to change when the routing does.
 *
 * Being behind `authGuard` is what makes requirement D11 work for free: an
 * operator who taps the link from Telegram while signed out is bounced to
 * `/login` and returned to the incident by the existing `returnUrl` handling
 * (`login.component.ts:90`), instead of landing on a dead page.
 */
export const INCIDENT_DETAIL_PATH = '/app/incidencias';

/**
 * Builds the absolute detail URL for an incident.
 *
 * Trailing slashes on `appBaseUrl` are stripped so a configured
 * `https://host/` yields `https://host/app/incidencias/:id` and not a
 * double-slash path that some routers treat as a different route.
 */
export function buildIncidentDetailLink(appBaseUrl: string, incidentId: string): string {
  const base = (appBaseUrl ?? '').replace(/\/+$/, '');
  return `${base}${INCIDENT_DETAIL_PATH}/${incidentId}`;
}