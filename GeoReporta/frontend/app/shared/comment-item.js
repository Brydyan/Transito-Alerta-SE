/**
 * @fileoverview Shared comment item builder.
 *
 * Both the public feed detail and the operator incidencias detail render
 * threaded comments with the same structure. This module provides a single
 * `buildCommentItem` function so the logic lives in one place.
 *
 * Layout per comment:
 *   [Avatar w/ initials]  Name  •  time          [⋮ menu on replies]
 *                         [🟣 Atención institucional]  (internal only)
 *                         ┌─────────────────────────────┐
 *                         │  message text               │
 *                         └─────────────────────────────┘
 *                         ↩ Responder  •  🗑 Eliminar
 *
 * @module shared/comment-item
 */

import { escapeHtml, timeAgo, getCommentImageUrl } from '../utils/format.js';
import { getUserDisplayName, resolveAvatarSrc } from '../utils/avatar.js';

/**
 * @typedef {Object} CommentItemOptions
 * @property {number|null}  currentUserId  - ID of the authenticated user, or null if guest.
 * @property {boolean}      [canDelete]    - Show delete button when the comment belongs to currentUserId.
 * @property {function}     [getUserName]  - Optional custom name resolver.
 *                                          Receives a user object, returns a display string.
 *                                          Defaults to "first last || email".
 * @property {function}     [onBuild]      - Called with (li, comment) after the element is built.
 */

/**
 * Default name resolver: "First Last" or email fallback.
 * @param {object} user
 * @returns {string}
 */
function defaultGetUserName(user) {
  // Issue #234 — defer to the shared helper so the same anonymous-payload
  // rules (is_anonymous → "Anónimo", missing user → "Anónimo") apply here
  // without duplicating the matrix. Fall back to the email only when the
  // helper itself returned its generic "Usuario" placeholder.
  const name = getUserDisplayName(user);
  if (name !== 'Usuario') return name;
  return user?.email || 'Usuario';
}

/**
 * Format message content, rendering Markdown blockquotes (`> text`) cleanly.
 * @param {string} msg
 * @returns {string}
 */
export function formatCommentMessage(msg) {
  if (!msg) return '';
  const lines = msg.split('\n');
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('>')) {
        const quoteText = trimmed.replace(/^>\s*/, '');
        return `<blockquote class="comment-quote">${escapeHtml(quoteText)}</blockquote>`;
      }
      return escapeHtml(line);
    })
    .join('<br>');
}

/** Palette for citizen avatar backgrounds (cycles by user id). */
const CITIZEN_COLORS = ['#4F6BED', '#7C3AED', '#0891B2', '#059669', '#D97706'];

/**
 * Pick a stable background colour for a citizen avatar.
 * @param {object|null} user
 * @returns {string}
 */
function avatarBg(user) {
  const id = user?.id ?? 0;
  return CITIZEN_COLORS[id % CITIZEN_COLORS.length];
}

/**
 * Maximum nesting depth for comment replies (0-based).
 *
 * The backend enforces the same limit in
 * `backend/app/Domains/Comments/Http/CommentController.php` — replies
 * whose parent already has `depth >= MAX_COMMENT_DEPTH` are rejected
 * with HTTP 422 (see the `parent->depth >= 2` check around line 64).
 *
 * Keep this constant in sync with the backend rule. The frontend uses
 * it to hide the "Responder" button when a reply would fail, and to
 * short-circuit `openInlineReplyForm` before any network call.
 *
 * @type {number}
 */
export const MAX_COMMENT_DEPTH = 2;

/**
 * Build a single `<li>` element for a comment (and its nested replies).
 *
 * @param {object}             comment  - Comment data from the API.
 * @param {CommentItemOptions} options
 * @param {number}             [depth]  - Current nesting depth (0 = root).
 * @returns {HTMLLIElement}
 */
export function buildCommentItem(comment, options = {}, depth = 0) {
  const {
    currentUserId = null,
    canDelete = false,
    getUserName = defaultGetUserName,
    onBuild = null,
  } = options;

  const li = document.createElement('li');
  li.className = 'comment-item' + (depth > 0 ? ' comment-item--reply' : '');

  // ── Name & role ──────────────────────────────────────────────────────────
  const userName = getUserName(comment.user);

  const role = (comment.user?.role || '').toLowerCase();
  const isInternal = ['admin', 'operator', 'support', 'staff'].includes(role);

  const avatarBgColor = isInternal ? '#4F6BED' : avatarBg(comment.user);
  let avatarContent;
  if (isInternal) {
    // Institutional staff keep the headset icon — intentional.
    avatarContent =
      '<i class="fas fa-headset" style="font-size:0.85rem;color:#fff"></i>';
  } else {
    const avatarSrc = resolveAvatarSrc(
      comment.user?.profile_image_path ?? comment.user?.avatar,
    );
    avatarContent = `<img src="${avatarSrc}" alt="${escapeHtml(userName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
  }
  const avatarHtml = `
    <div class="comment-avatar" style="background:${avatarBgColor}" aria-hidden="true">
      ${avatarContent}
    </div>`;

  const institutionalBadge = isInternal
    ? `<span class="comment-badge-institutional">
         <i class="fas fa-headset"></i> Atención institucional
       </span>`
    : '';

  // ── Action buttons ────────────────────────────────────────────────────────
  const canReply =
    currentUserId != null && (comment.depth ?? 0) < MAX_COMMENT_DEPTH;
  const replyBtn = canReply
    ? `<button type="button"
         class="comment-action-btn btn-responder-comentario"
         data-id="${escapeHtml(String(comment.id))}"
         title="Responder">
         <i class="fas fa-reply"></i> Responder
       </button>`
    : '';

  const isOwner = currentUserId != null && comment.user_id === currentUserId;
  const deleteBtn =
    canDelete && isOwner
      ? `<span class="comment-action-sep" aria-hidden="true">•</span>
       <button type="button"
         class="comment-action-btn comment-action-btn--danger btn-eliminar-comentario"
         data-id="${escapeHtml(String(comment.id))}"
         title="Eliminar comentario">
         <i class="fas fa-trash-alt"></i> Eliminar
       </button>`
      : '';

  const actionsHtml =
    replyBtn || deleteBtn
      ? `<div class="comment-actions">${replyBtn}${deleteBtn}</div>`
      : '';

  // ── Attached images ───────────────────────────────────────────────────────
  const imagesHtml =
    comment.images && comment.images.length > 0
      ? `<div class="incid-detail__thumbnail-grid mt-2">
        ${comment.images
          .map((img) => {
            const src = escapeHtml(getCommentImageUrl(img.url));
            const caption = escapeHtml(img.caption || img.original_name || '');
            return `<div class="incid-detail__thumbnail-wrapper" data-src="${src}" data-caption="${caption}">
                    <img src="${src}" alt="${caption}" class="incid-detail__thumbnail" />
                    <div class="incid-detail__thumbnail-overlay">
                      ${caption ? `<span class="incid-detail__thumbnail-caption">${caption}</span>` : ''}
                    </div>
                  </div>`;
          })
          .join('')}
       </div>`
      : '';

  // ── Message formatting ──────────────────────────────────────────────────
  const messageHtml = formatCommentMessage(comment.message);

  // ── Assemble ──────────────────────────────────────────────────────────────
  li.innerHTML = `
    ${avatarHtml}
    <div class="comment-body">
      <div class="comment-header">
        <span class="comment-author">${escapeHtml(userName)}</span>
        <span class="comment-sep" aria-hidden="true">•</span>
        <span class="comment-time">${timeAgo(comment.created_at)}</span>
      </div>
      ${institutionalBadge}
      <div class="comment-bubble">${messageHtml}</div>
      ${imagesHtml}
      ${actionsHtml}
    </div>`;

  // ── Nested replies ────────────────────────────────────────────────────────
  if (comment.replies && comment.replies.length > 0) {
    const replyDepth = depth >= 1 ? 1 : depth + 1;
    const replyUl = document.createElement('ul');
    replyUl.className = 'comment-replies';

    for (const reply of comment.replies) {
      replyUl.appendChild(buildCommentItem(reply, options, replyDepth));
    }

    // Append replies inside the body column, below the actions.
    const body = li.querySelector('.comment-body');
    (body ?? li).appendChild(replyUl);
  }

  if (onBuild) onBuild(li, comment);

  return li;
}
