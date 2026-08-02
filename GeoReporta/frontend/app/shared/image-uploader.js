/**
 * @fileoverview Shared multi-image uploader component with Drag & Drop,
 * mobile camera/gallery capture, thumbnail preview, and individual file removal.
 *
 * @module shared/image-uploader
 */

// D10 validation parity: keep these in sync with backend/app/Storage/ImageRules.php
// (MAX_FILES, MAX_SIZE_KB / 1024, MIMES).
export const DEFAULT_MAX_FILES = 10;
export const DEFAULT_MAX_SIZE_MB = 5;
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

/**
 * Mount a multi-image uploader widget inside a target container.
 *
 * @param {Object} options
 * @param {HTMLElement|string} options.container - Container element or selector.
 * @param {number} [options.maxFiles=10] - Maximum number of allowed images.
 * @param {number} [options.maxSizeMB=5] - Maximum size per image in MB.
 * @param {File[]} [options.initialFiles=[]] - Initial files to display.
 * @param {(files: File[]) => void} [options.onChange] - Callback fired whenever the file list changes.
 * @returns {Object|null} Controller { getFiles, clear, destroy }
 */
export function mountImageUploader(options = {}) {
  const container =
    typeof options.container === 'string'
      ? document.querySelector(options.container)
      : options.container;

  if (!container) {
    console.warn('[image-uploader] Missing container element');
    return null;
  }

  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxSizeMB = options.maxSizeMB ?? DEFAULT_MAX_SIZE_MB;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const onChange = options.onChange ?? (() => {});

  let selectedFiles = Array.isArray(options.initialFiles)
    ? [...options.initialFiles]
    : [];
  const objectUrlMap = new Map(); // File -> ObjectURL

  // Render main layout
  container.innerHTML = `
    <div class="image-uploader">
      <!-- Drag & Drop Zone / Desktop Trigger -->
      <div class="image-uploader__dropzone" id="iu-dropzone" tabIndex="0" role="button" aria-label="Zona de subida de imágenes">
        <div class="image-uploader__dropzone-icon">
          <i class="fas fa-cloud-upload-alt"></i>
        </div>
        <div class="image-uploader__dropzone-text">
          <strong>Arrastrá y soltá tus imágenes acá</strong>
          <span>o hacé clic para explorar tus archivos</span>
        </div>
        <div class="image-uploader__dropzone-hint">
          JPEG, PNG, WebP o GIF (hasta ${maxSizeMB} MB por foto)
        </div>
      </div>

      <!-- Mobile Action Buttons (Camera vs Gallery) -->
      <div class="image-uploader__mobile-actions">
        <button type="button" class="btn btn-outline-primary image-uploader__mobile-btn" id="iu-btn-camera">
          <i class="fas fa-camera me-2"></i>Tomar foto
        </button>
        <button type="button" class="btn btn-outline-secondary image-uploader__mobile-btn" id="iu-btn-gallery">
          <i class="fas fa-images me-2"></i>Elegir de galería
        </button>
      </div>

      <!-- Hidden native inputs -->
      <input type="file" id="${options.inputId || 'iu-file-input-desktop'}" accept="${ACCEPTED_IMAGE_TYPES.join(',')}" multiple class="d-none iu-file-input-desktop" />
      <input type="file" id="iu-file-input-camera" accept="image/*" capture="environment" class="d-none" />
      <input type="file" id="iu-file-input-gallery" accept="${ACCEPTED_IMAGE_TYPES.join(',')}" multiple class="d-none" />

      <!-- Error feedback -->
      <div class="image-uploader__error text-danger small mt-2 d-none" id="iu-error"></div>

      <!-- Header counter -->
      <div class="image-uploader__header mt-3 d-none" id="iu-header">
        <span class="image-uploader__count" id="iu-count">0 / ${maxFiles} imágenes</span>
      </div>

      <!-- Thumbnail Preview Grid -->
      <div class="image-uploader__grid mt-2" id="iu-grid"></div>
    </div>
  `;

  const dropzone = container.querySelector('#iu-dropzone');
  const btnCamera = container.querySelector('#iu-btn-camera');
  const btnGallery = container.querySelector('#iu-btn-gallery');
  const inputDesktop = container.querySelector('.iu-file-input-desktop');
  const inputCamera = container.querySelector('#iu-file-input-camera');
  const inputGallery = container.querySelector('#iu-file-input-gallery');
  const errorEl = container.querySelector('#iu-error');
  const headerEl = container.querySelector('#iu-header');
  const countEl = container.querySelector('#iu-count');
  const gridEl = container.querySelector('#iu-grid');

  function showError(msg) {
    if (!errorEl) return;
    if (msg) {
      errorEl.textContent = msg;
      errorEl.classList.remove('d-none');
    } else {
      errorEl.textContent = '';
      errorEl.classList.add('d-none');
    }
  }

  function getObjectURL(file) {
    if (!objectUrlMap.has(file)) {
      const url =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(file)
          : '';
      objectUrlMap.set(file, url);
    }
    return objectUrlMap.get(file);
  }

  function revokeObjectURL(file) {
    if (objectUrlMap.has(file)) {
      const url = objectUrlMap.get(file);
      if (
        url &&
        typeof URL !== 'undefined' &&
        typeof URL.revokeObjectURL === 'function'
      ) {
        URL.revokeObjectURL(url);
      }
      objectUrlMap.delete(file);
    }
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    showError('');

    if (selectedFiles.length > 0) {
      headerEl.classList.remove('d-none');
      countEl.textContent = `${selectedFiles.length} / ${maxFiles} imágenes`;
    } else {
      headerEl.classList.add('d-none');
    }

    selectedFiles.forEach((file, index) => {
      const card = document.createElement('div');
      card.className = 'image-uploader__card';

      const src = getObjectURL(file);
      card.innerHTML = `
        <img src="${src}" alt="${escapeHtml(file.name)}" class="image-uploader__thumb" />
        <button type="button" class="image-uploader__remove-btn" data-index="${index}" title="Quitar foto" aria-label="Quitar foto ${escapeHtml(file.name)}">
          <i class="fas fa-times"></i>
        </button>
        <span class="image-uploader__filename">${escapeHtml(file.name)}</span>
      `;

      card
        .querySelector('.image-uploader__remove-btn')
        .addEventListener('click', (e) => {
          e.stopPropagation();
          removeFile(index);
        });

      gridEl.appendChild(card);
    });

    onChange([...selectedFiles]);
  }

  function addFiles(newFiles) {
    showError('');
    const validFiles = [];
    let errorMessage = '';

    for (const file of newFiles) {
      if (selectedFiles.length + validFiles.length >= maxFiles) {
        errorMessage = `Solo podés adjuntar un máximo de ${maxFiles} imágenes.`;
        break;
      }

      const fileType = (file.type || '').toLowerCase();
      const fileName = (file.name || '').toLowerCase();
      const isImage =
        fileType.startsWith('image/') ||
        ACCEPTED_IMAGE_TYPES.includes(fileType) ||
        /\.(jpe?g|png|webp|gif)$/i.test(fileName);

      if (!isImage) {
        errorMessage = `El archivo "${file.name}" no es una imagen válida (JPEG, PNG o WebP).`;
        continue;
      }

      if (file.size > maxSizeBytes) {
        errorMessage = `La imagen "${file.name}" supera el tamaño máximo permitido de ${maxSizeMB} MB.`;
        continue;
      }

      // Check duplicates by name & size
      const isDuplicate = selectedFiles.some(
        (f) => f.name === file.name && f.size === file.size,
      );
      if (!isDuplicate) {
        validFiles.push(file);
      }
    }

    if (validFiles.length > 0) {
      selectedFiles.push(...validFiles);
      renderGrid();
    }

    if (errorMessage) {
      showError(errorMessage);
    }
  }

  function removeFile(index) {
    if (index >= 0 && index < selectedFiles.length) {
      const [removed] = selectedFiles.splice(index, 1);
      revokeObjectURL(removed);
      renderGrid();
    }
  }

  // Event handlers
  const onDropzoneClick = () => inputDesktop.click();
  const onDropzoneKeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputDesktop.click();
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragging');
  };

  const onDragLeave = () => {
    dropzone.classList.remove('is-dragging');
  };

  const onDrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragging');
    if (e.dataTransfer && e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const onFileChange = function () {
    if (this.files && this.files.length > 0) {
      addFiles(Array.from(this.files));
      try {
        this.value = '';
      } catch (_) {}
    }
  };

  dropzone.addEventListener('click', onDropzoneClick);
  dropzone.addEventListener('keydown', onDropzoneKeydown);
  dropzone.addEventListener('dragover', onDragOver);
  dropzone.addEventListener('dragleave', onDragLeave);
  dropzone.addEventListener('drop', onDrop);

  btnCamera.addEventListener('click', () => inputCamera.click());
  btnGallery.addEventListener('click', () => inputGallery.click());

  inputDesktop.addEventListener('change', onFileChange);
  inputCamera.addEventListener('change', onFileChange);
  inputGallery.addEventListener('change', onFileChange);

  // Initial render
  renderGrid();

  return {
    getFiles() {
      return [...selectedFiles];
    },
    clear() {
      selectedFiles.forEach((f) => revokeObjectURL(f));
      selectedFiles = [];
      renderGrid();
    },
    destroy() {
      selectedFiles.forEach((f) => revokeObjectURL(f));
      selectedFiles = [];
      container.innerHTML = '';
    },
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
