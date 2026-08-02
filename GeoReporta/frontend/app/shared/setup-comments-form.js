import { auth } from '../auth/auth.service.js';
import { commentService } from './comment.service.js';
import { openLightbox, closeLightbox } from './lightbox.js';
import { openInlineReplyForm } from './comment-reply.js';
import { renderCommentThread } from './comment-thread.js';

export default async function setupCommentsForm({
  incidentId,
  initialComments,
  loadingId,
  formId,
  inputId,
  submitId,
  counterId,
  listId,
  emptyId,
  errorId,
  previewId,
  fileInputId,
  attachButtonId,
  replyBadgeId,
  replyParentIdId,
  lightboxId,
  lightboxCloseId,
  thumbnailSelector,
  canDelete = false,
  getUserName,
}) {
  const loadingEl = document.getElementById(loadingId);
  const form = document.getElementById(formId);
  const input = document.getElementById(inputId);
  const errorEl = document.getElementById(errorId);
  const submitBtn = document.getElementById(submitId);
  const counterEl = counterId ? document.getElementById(counterId) : null;
  const listEl = document.getElementById(listId);
  const emptyEl = document.getElementById(emptyId);
  const fileInput = document.getElementById(fileInputId);
  const attachBtn = attachButtonId
    ? document.getElementById(attachButtonId)
    : null;
  const previewEl = document.getElementById(previewId);
  const replyBadgeEl = document.getElementById(replyBadgeId);
  const replyParentIdEl = document.getElementById(replyParentIdId);

  if (!form || !input) return;

  let currentUserId = null;
  let commentById = new Map();
  let hasLoadedComments = false;
  const replyState = { parentId: null, parentComment: null };
  const selectedFiles = [];
  const previewUrls = [];

  function updateCounter() {
    const len = input.value.length;
    if (counterEl) {
      counterEl.textContent = `${len}/5000`;
      counterEl.classList.toggle('text-danger', len >= 4000);
    }
  }

  function updateSubmitBtn() {
    if (counterEl && submitBtn) {
      submitBtn.disabled = input.value.trim() === '';
    }
  }

  function renderPreviews() {
    if (!previewEl) return;
    previewEl.innerHTML = selectedFiles
      .map((_, i) => {
        const url = previewUrls[i];
        if (!url) return '';
        return `<div class="position-relative d-inline-block" style="margin-bottom:4px">
          <img src="${url}" class="incid-detail__preview-thumb" alt="Preview" />
          <button type="button" class="incid-detail__preview-remove btn-quitar-preview" data-index="${i}">&times;</button>
        </div>`;
      })
      .join('');
  }

  function cancelReply() {
    const prefix = '> @';
    if (input.value.startsWith(prefix)) {
      const nlIdx = input.value.indexOf('\n');
      input.value = nlIdx >= 0 ? input.value.slice(nlIdx + 1) : '';
    }
    replyBadgeEl?.classList.add('d-none');
    if (replyParentIdEl) replyParentIdEl.value = '';
    replyState.parentId = null;
    replyState.parentComment = null;
    updateSubmitBtn();
  }

  function handleFileSelect(files) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      selectedFiles.push(file);
      previewUrls.push(URL.createObjectURL(file));
    }
    renderPreviews();
  }

  function removeFile(index) {
    if (index < 0 || index >= previewUrls.length) return;
    URL.revokeObjectURL(previewUrls[index]);
    previewUrls.splice(index, 1);
    selectedFiles.splice(index, 1);
    renderPreviews();
  }

  function clearFiles() {
    for (const url of previewUrls) URL.revokeObjectURL(url);
    selectedFiles.length = 0;
    previewUrls.length = 0;
    renderPreviews();
  }

  function renderComments(items) {
    commentById = renderCommentThread({
      items,
      listEl,
      emptyEl,
      currentUserId,
      canDelete,
      getUserName,
    });
  }

  async function refresh() {
    loadingEl?.classList.remove('d-none');
    try {
      if (!hasLoadedComments && initialComments) {
        renderComments(initialComments);
      } else {
        const { data } = await commentService.list(incidentId, { perPage: 50 });
        renderComments(data);
      }
    } catch (err) {
      console.error('Error al cargar comentarios:', err);
    } finally {
      loadingEl?.classList.add('d-none');
      hasLoadedComments = true;
    }
  }

  if (counterEl) {
    input.addEventListener('input', () => {
      updateCounter();
      updateSubmitBtn();
    });
  }

  fileInput?.addEventListener('change', () => {
    handleFileSelect(fileInput.files);
    fileInput.value = '';
  });

  attachBtn?.addEventListener('click', () => {
    fileInput?.click();
  });

  if (replyBadgeEl) {
    replyBadgeEl.addEventListener('click', cancelReply);
    replyBadgeEl.style.cursor = 'pointer';
    replyBadgeEl.title = 'Clic para cancelar';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl?.classList.add('d-none');

    const message = input.value.trim();
    if (!message) {
      if (errorEl) {
        errorEl.textContent = 'El comentario no puede estar vacío.';
        errorEl.classList.remove('d-none');
      }
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const parentId = replyParentIdEl?.value
        ? Number(replyParentIdEl.value)
        : null;
      const imageIds = [];

      if (selectedFiles.length > 0) {
        const created = await commentService.create(incidentId, {
          message,
          parentId,
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
          if (errorEl) {
            errorEl.textContent =
              'Error al subir una o más imágenes. El comentario no fue publicado.';
            errorEl.classList.remove('d-none');
          }
          await commentService.delete(commentId);
          throw new Error('Upload failed');
        }
      } else {
        await commentService.create(incidentId, {
          message,
          parentId,
          imageIds,
        });
      }

      input.value = '';
      clearFiles();
      cancelReply();
      updateCounter();
      updateSubmitBtn();
      await refresh();
    } catch (err) {
      if (err.message === 'Upload failed') return;
      if (errorEl) {
        errorEl.textContent =
          err.message || 'No se pudo publicar el comentario.';
        errorEl.classList.remove('d-none');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  listEl?.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('.btn-eliminar-comentario');
    if (canDelete && deleteBtn) {
      const commentId = deleteBtn.dataset.id;
      if (!commentId) return;
      if (!confirm('¿Eliminar este comentario?')) return;
      deleteBtn.disabled = true;
      try {
        await commentService.delete(commentId);
        await refresh();
      } catch (err) {
        console.error('Error al eliminar comentario:', err);
        alert('No se pudo eliminar el comentario.');
      } finally {
        deleteBtn.disabled = false;
      }
      return;
    }

    const replyBtn = event.target.closest('.btn-responder-comentario');
    if (replyBtn) {
      const commentId = Number(replyBtn.dataset.id);
      const found = commentById.get(commentId);
      if (found) {
        openInlineReplyForm({
          incidentId,
          comment: found,
          li: replyBtn.closest('li'),
          getUserName,
          onPosted: refresh,
        });
      }
      return;
    }

    const previewRemoveBtn = event.target.closest('.btn-quitar-preview');
    if (previewRemoveBtn) {
      removeFile(Number(previewRemoveBtn.dataset.index));
      return;
    }

    const thumb = event.target.closest(thumbnailSelector);
    if (thumb) {
      openLightbox(thumb.dataset.src, thumb.dataset.caption || '');
      return;
    }

    const delImgBtn = event.target.closest('.btn-eliminar-imagen');
    if (delImgBtn) {
      const commentId = Number(delImgBtn.dataset.commentId);
      const imageId = Number(delImgBtn.dataset.imageId);
      if (!confirm('¿Eliminar esta imagen?')) return;
      delImgBtn.disabled = true;
      try {
        await commentService.deleteImage(commentId, imageId);
        await refresh();
      } catch (err) {
        console.error('Error al eliminar imagen:', err);
        alert('No se pudo eliminar la imagen.');
      } finally {
        delImgBtn.disabled = false;
      }
    }
  });

  listEl?.addEventListener('dblclick', (event) => {
    const thumb = event.target.closest(thumbnailSelector);
    if (thumb) {
      openLightbox(thumb.dataset.src, thumb.dataset.caption || '');
    }
  });

  const lightboxEl = document.getElementById(lightboxId);
  if (lightboxEl) {
    document
      .getElementById(lightboxCloseId)
      ?.addEventListener('click', closeLightbox);
    lightboxEl.addEventListener('click', (event) => {
      if (event.target === lightboxEl) closeLightbox();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !lightboxEl.classList.contains('d-none')) {
        closeLightbox();
      }
    });
  }

  try {
    const user = await auth.me();
    currentUserId = user?.id;
  } catch {
    currentUserId = null;
  }

  if (initialComments && initialComments.length > 0) {
    loadingEl?.classList.add('d-none');
    renderComments(initialComments);
    hasLoadedComments = true;
  } else {
    await refresh();
  }

  return {
    refresh,
    cancel: cancelReply,
    getSelectedFiles: () => selectedFiles,
  };
}
