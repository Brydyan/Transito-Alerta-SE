import { STATUS_LABEL } from './format.js';

/**
 * Pure transforms over an incident's status_history array, shared by the
 * citizen timeline (feed-detail, grouped by day) and the operator list
 * (incidencias.detail, flat). Each view keeps its own markup — only the
 * sort + label/name resolution were duplicated.
 */

export function sortStatusHistoryDesc(items) {
  return [...(items ?? [])].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );
}

/**
 * @returns {{ prev: string, next: string, userName: string }}
 */
export function statusHistoryEntry(item) {
  return {
    prev: STATUS_LABEL[item.previous_status] ?? item.previous_status ?? '—',
    next: STATUS_LABEL[item.new_status] ?? item.new_status ?? '—',
    userName: item.user
      ? [item.user.first_name, item.user.last_name].filter(Boolean).join(' ')
      : 'Sistema',
  };
}
