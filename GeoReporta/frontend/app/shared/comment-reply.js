import { escapeHtml } from '../utils/format.js';
import { getUserDisplayName } from '../utils/avatar.js';
import { commentService } from './comment.service.js';
import { MAX_COMMENT_DEPTH } from './comment-item.js';

/**
 * Open an inline reply form below the comment being replied to.
 * Shared by the citizen detail view (feed-detail) and the operator detail
 * view (incidencias.detail) — it was a byte-identical copy in both.
 *
 * Only one inline form is open at a time — opening a new one closes the
 * previous. The form scrolls into view and focuses the textarea. Submitting
 * posts to the same `commentService.create` API as the main form, then
 * invokes `onPosted` so the caller reloads its comment list.
 *
 * Comments at the backend's max depth (depth >= MAX_COMMENT_DEPTH) cannot
 * be replied to, so this function returns silently.
 *
 * NOTE: image attachment is intentionally NOT supported on inline replies —
 * the main comment form is the only path that can attach images.
 *
 * @param {object} options
 * @param {number} options.incidentId
 * @param {object} options.comment  Backend comment (needs id, depth, user).
 * @param {Element} options.li      The rendered <li> of the comment.
 * @param {(user: object) => string} [options.getUserName]  Display-name
 *   resolver — callers keep their own fallback rules (feed uses
 *   getUserDisplayName, incidencias falls back to the email).
 * @param {() => void|Promise<void>} [options.onPosted]  Called after a
 *   successful post (reload the list here).
 */
export function openInlineReplyForm({
  incidentId,
  comment,
  li,
  getUserName,
  onPosted,
}) {
  if ((comment.depth ?? 0) >= MAX_COMMENT_DEPTH) return;

  // Close any previously open inline reply form (only one at a time)
  document
    .querySelectorAll('.fd-comment-inline-reply')
    .forEach((f) => f.remove());

  const commentBody = li.querySelector('.comment-body');
  if (!commentBody) return;

  const parentUser = comment.user
    ? (getUserName?.(comment.user) ?? getUserDisplayName(comment.user)) ||
      'Usuario'
    : 'Usuario';

  const selectedFiles = [];
  const previewUrls = [];

  const form = document.createElement('form');
  form.className = 'fd-comment-inline-reply mt-3 pt-3 border-top';
  form.dataset.parentId = String(comment.id);
  form.innerHTML = `
    <textarea class="form-control form-control-sm" rows="2" placeholder="Escribe tu respuesta a @${escapeHtml(parentUser)}... (Enter para enviar, Shift+Enter para nueva línea)" required></textarea>
    <input type="file" class="fd-inline-reply-file d-none" multiple accept="image/jpeg,image/png,image/webp" capture="environment" />
    <div class="d-flex justify-content-between align-items-center mt-2">
      <button type="button" class="btn btn-outline-secondary btn-sm fd-inline-reply-attach" title="Adjuntar o tomar foto" aria-label="Adjuntar o tomar foto">
        <i class="fas fa-camera"></i>
      </button>
    </div>
    <div class="fd-inline-reply-previews d-flex flex-wrap gap-2 my-2"></div>
    <div class="fd-comment-inline-reply__error text-danger small mb-2" style="display:none"></div>
    <div class="d-flex gap-2 mt-2 justify-content-end">
      <button type="button" class="btn btn-link btn-sm text-muted fd-inline-reply-cancel">Cancelar</button>
      <button type="submit" class="btn btn-primary btn-sm fd-inline-reply-submit">
        <i class="fas fa-paper-plane me-1"></i>Responder
      </button>
    </div>
  `;

  commentBody.appendChild(form);
  const textarea = form.querySelector('textarea');
  const fileInput = form.querySelector('.fd-inline-reply-file');
  const attachBtn = form.querySelector('.fd-inline-reply-attach');
  const previewsEl = form.querySelector('.fd-inline-reply-previews');
  const errorBox = form.querySelector('.fd-comment-inline-reply__error');
  textarea.focus();

  function renderPreviews() {
    previewsEl.innerHTML = selectedFiles
      .map((_, i) => {
        const url = previewUrls[i];
        if (!url) return '';
        return `<div class="position-relative d-inline-block" style="margin-bottom:4px">
          <img src="${url}" class="incid-detail__preview-thumb" alt="Preview" />
          <button type="button" class="incid-detail__preview-remove fd-inline-reply-remove-preview" data-index="${i}">&times;</button>
        </div>`;
      })
      .join('');
  }

  function clearFiles() {
    for (const url of previewUrls) URL.revokeObjectURL(url);
    selectedFiles.length = 0;
    previewUrls.length = 0;
    renderPreviews();
  }

  attachBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files) {
      for (const file of Array.from(fileInput.files)) {
        if (!file.type.startsWith('image/')) continue;
        selectedFiles.push(file);
        previewUrls.push(URL.createObjectURL(file));
      }
      renderPreviews();
      fileInput.value = '';
    }
  });

  previewsEl.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.fd-inline-reply-remove-preview');
    if (removeBtn) {
      const idx = Number(removeBtn.dataset.index);
      if (idx >= 0 && idx < previewUrls.length) {
        URL.revokeObjectURL(previewUrls[idx]);
        previewUrls.splice(idx, 1);
        selectedFiles.splice(idx, 1);
        renderPreviews();
      }
    }
  });

  // Double-submit guard: `submitBtn.disabled = true` only takes effect
  // AFTER the submit handler runs, so a fast second Enter could trigger
  // another requestSubmit() before the first submit has even started.
  // The `submitting` flag is checked synchronously in BOTH the keydown
  // handler AND the submit handler.
  let submitting = false;

  // Enter without Shift submits; Shift+Enter inserts a new line.
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !submitting) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form
    .querySelector('.fd-inline-reply-cancel')
    .addEventListener('click', () => {
      clearFiles();
      form.remove();
    });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    const message = textarea.value.trim();
    if (!message) return;

    submitting = true;
    const submitBtn = form.querySelector('.fd-inline-reply-submit');
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1"></span>Enviando...';
    errorBox.style.display = 'none';

    try {
      if (selectedFiles.length > 0) {
        const created = await commentService.create(incidentId, {
          message,
          parentId: comment.id,
          imageIds: [],
        });
        const commentId = created?.id ?? created?.data?.id;
        if (!commentId) throw new Error('No se pudo crear el comentario.');

        const results = await Promise.allSettled(
          selectedFiles.map((file) =>
            commentService.uploadImages(commentId, [file]),
          ),
        );
        const failed = results.filter(
          (result) =>
            result.status === 'rejected' ||
            (result.status === 'fulfilled' && result.value?.status >= 400),
        );
        if (failed.length > 0) {
          clearFiles();
          await commentService.delete(commentId);
          throw new Error(
            'Error al subir una o más imágenes. La respuesta no fue publicada.',
          );
        }
      } else {
        await commentService.create(incidentId, {
          message,
          parentId: comment.id,
          imageIds: [],
        });
      }

      clearFiles();
      form.remove();
      await onPosted?.();
    } catch (err) {
      console.error('Error al enviar respuesta:', err);
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>Responder';
      // Show the actual backend error message (e.g. "no se puede
      // responder a un comentario de segundo nivel").
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'No se pudo enviar la respuesta. Intenta de nuevo.';
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    }
  });
}
