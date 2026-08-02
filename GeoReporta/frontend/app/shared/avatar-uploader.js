import { ACCEPTED_MIME_TYPES } from '../utils/avatar.constants.js';

/**
 * Helper compartido de subida de avatar.
 *
 * Render pattern:
 *   - Wrap (clickeable): abre el file picker hidden al hacer click.
 *   - Preview <img>: muestra la imagen seleccionada via Object URL.
 *   - File input: hidden, acepta solo image/jpeg, image/png, image/webp.
 *
 * El caller decide COMO enviar el archivo al backend (FormData con el
 * submit del form, upload por endpoint, etc). El helper NO sube nada
 * por su cuenta; solo gestiona estado local (preview + cleanup).
 *
 * Click behaviour: clicks whose target is inside an element marked with
 * `data-avatar-ignore` (e.g. a "remove" button placed on the avatar) are
 * NOT propagated to the file picker, so consumers can layer controls on
 * top of the wrap.
 *
 * @param {Object} opts
 * @param {string|HTMLElement} opts.wrap - Clickable wrap element or selector.
 * @param {string|HTMLElement} opts.preview - <img> element or selector showing the live preview.
 * @param {string|HTMLElement} opts.input - Hidden <input type="file"> or selector.
 * @returns {Object|null} Controller {getFile, clear, setPreviewFromUrl, destroy}, or null on missing DOM.
 */
export function mountAvatarUploader({ wrap, preview, input }) {
  const wrapEl = resolveEl(wrap);
  const previewEl = resolveEl(preview);
  const inputEl = resolveEl(input);

  if (!wrapEl || !previewEl || !inputEl) {
    console.warn('[avatar-uploader] Missing DOM element(s)');
    return null;
  }

  let _objectUrl = null;

  const onWrapClick = (e) => {
    if (e.target.closest('[data-avatar-ignore]')) return;
    e.preventDefault();
    inputEl.click();
  };
  wrapEl.addEventListener('click', onWrapClick);

  const onInputChange = function () {
    if (_objectUrl) {
      URL.revokeObjectURL(_objectUrl);
      _objectUrl = null;
    }
    const file = this.files && this.files[0];
    if (!file) {
      previewEl.style.display = 'none';
      previewEl.src = '';
      return;
    }
    _objectUrl = URL.createObjectURL(file);
    previewEl.src = _objectUrl;
    previewEl.style.display = 'block';
  };
  inputEl.addEventListener('change', onInputChange);

  inputEl.accept = ACCEPTED_MIME_TYPES.join(',');

  return {
    getFile() {
      return inputEl.files && inputEl.files[0] ? inputEl.files[0] : null;
    },
    clear() {
      if (_objectUrl) {
        URL.revokeObjectURL(_objectUrl);
        _objectUrl = null;
      }
      inputEl.value = '';
      previewEl.removeAttribute('src');
      previewEl.style.display = 'none';
    },
    setPreviewFromUrl(url) {
      if (_objectUrl) {
        URL.revokeObjectURL(_objectUrl);
        _objectUrl = null;
      }
      inputEl.value = '';
      previewEl.src = url;
      previewEl.style.display = 'block';
    },
    destroy() {
      wrapEl.removeEventListener('click', onWrapClick);
      inputEl.removeEventListener('change', onInputChange);
      if (_objectUrl) {
        URL.revokeObjectURL(_objectUrl);
        _objectUrl = null;
      }
    },
  };
}

function resolveEl(elOrSelector) {
  if (!elOrSelector) return null;
  if (typeof elOrSelector === 'string') {
    return document.querySelector(elOrSelector);
  }
  return elOrSelector;
}
