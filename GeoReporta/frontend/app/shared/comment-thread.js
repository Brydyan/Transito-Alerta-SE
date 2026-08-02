import { buildCommentItem } from './comment-item.js';

/**
 * Render a comment thread into a list element and index every comment
 * (root + nested replies) by id. Shared by feed-detail and
 * incidencias.detail, which only diverged in DOM ids, the canDelete flag
 * and the display-name fallback.
 *
 * The returned Map lets the caller's click handler look up the full
 * comment object — including the backend-provided `.depth`, `.user` and
 * `.message` — instead of scraping the rendered DOM.
 *
 * @param {object} options
 * @param {Array} options.items  Root comments (with nested `replies`).
 * @param {Element|null} options.listEl
 * @param {Element|null} [options.emptyEl]
 * @param {number|null} [options.currentUserId]
 * @param {boolean} [options.canDelete]
 * @param {(user: object) => string} [options.getUserName]
 * @returns {Map<number, object>} commentId → comment
 */
export function renderCommentThread({
  items,
  listEl,
  emptyEl,
  currentUserId = null,
  canDelete = false,
  getUserName,
}) {
  const byId = new Map();
  flattenCommentsIntoMap(items, byId);

  if (!listEl) return byId;

  if (!items || items.length === 0) {
    listEl.replaceChildren();
    emptyEl?.classList.remove('d-none');
    return byId;
  }

  emptyEl?.classList.add('d-none');
  listEl.replaceChildren(
    ...items.map((c) =>
      buildCommentItem(
        c,
        {
          currentUserId,
          canDelete,
          getUserName: getUserName ?? defaultUserName,
        },
        0,
      ),
    ),
  );

  return byId;
}

function defaultUserName(u) {
  if (!u) return 'Usuario';
  return (
    [u.first_name, u.last_name].filter(Boolean).join(' ') ||
    u.email ||
    'Usuario'
  );
}

function flattenCommentsIntoMap(items, map) {
  if (!items) return;
  for (const c of items) {
    map.set(c.id, c);
    if (c.replies && c.replies.length > 0) {
      flattenCommentsIntoMap(c.replies, map);
    }
  }
}
