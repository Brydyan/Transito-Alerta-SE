/**
 * Shared formatting helpers used across the admin and citizen shells.
 *
 * Single-source helpers extracted from duplicate definitions in
 * `feed/feed.component.js`, `feed/pages/detail/feed-detail.component.js`,
 * `incidencias/pages/detail/incidencias.detail.component.js`, and
 * `incidencias/pages/pendientes/pendientes.component.js`.
 *
 * `STATUS_LABEL` is re-exported from the generated
 * `utils/status.constants.js` (sourced from the `IncidentStatus` enum
 * on the backend via `incidents:generate-frontend-constants`).
 * Don't redefine it here — CI will fail.
 */

import { STATUS_LABEL } from './status.constants.js';

export { STATUS_LABEL };

/**
 * Escape a string so it is safe to interpolate into an HTML template.
 * Returns an empty string for falsy input.
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render a Spanish "time ago" string for a given ISO date.
 *
 *   < 60s      → "justo ahora"
 *   < 60min    → "hace Xmin"
 *   < 24h      → "hace Xh"
 *   < 7d       → "hace Xd"
 *   otherwise  → short localized date
 */
export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'justo ahora';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin}min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `hace ${diffDays}d`;
  return new Date(dateStr).toLocaleDateString('es-EC', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Map from incident priority keys to Spanish display labels.
 */
export const PRIORITY_LABEL = Object.freeze({
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
});

export function getCommentImageUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/storage/')) return path;
  if (path.startsWith('storage/')) return '/' + path;
  return `/storage/${path}`;
}

/**
 * Bootstrap color keys per priority/status — used by the badge helpers
 * below and by any view that needs the raw color (e.g. map markers).
 */
export const PRIORITY_COLOR = Object.freeze({
  high: 'danger',
  medium: 'warning',
  low: 'success',
});

export const STATUS_COLOR = Object.freeze({
  pending: 'secondary',
  in_progress: 'primary',
  resolved: 'success',
  pending_operator: 'warning',
});

export function badgePrioridad(p) {
  const label = PRIORITY_LABEL[p] || '—';
  return `<span class="badge bg-${PRIORITY_COLOR[p] || 'secondary'}">${label}</span>`;
}

export function badgeEstado(e) {
  return `<span class="badge bg-${STATUS_COLOR[e] || 'secondary'}">${STATUS_LABEL[e] || e || '—'}</span>`;
}

export function formatearFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const NON_NUMERIC_RE = /[^0-9+\- ()]/g;
const CONTROL_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Escape',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
]);

export function blockNonNumeric(e) {
  if (CONTROL_KEYS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === ' ' || e.key.length !== 1) return;
  NON_NUMERIC_RE.lastIndex = 0;
  if (NON_NUMERIC_RE.test(e.key)) {
    e.preventDefault();
  }
}

/** Shared email validation regex. Used across login and user management forms. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
