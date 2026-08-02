let _lightboxEl = null;
let _lightboxImg = null;
let _lightboxCaption = null;
let _boundEscape = null;

export function openLightbox(src, caption = '') {
  if (!_lightboxEl) {
    _lightboxEl =
      document.getElementById('incid-detail__lightbox') ||
      document.getElementById('fd-lightbox');
  }
  if (!_lightboxEl) {
    _lightboxEl = document.createElement('div');
    _lightboxEl.id = 'lightbox-overlay';
    _lightboxEl.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9000;display:flex;align-items:center;justify-content:center;';
    _lightboxImg = document.createElement('img');
    _lightboxImg.style.cssText =
      'max-width:90vw;max-height:90vh;object-fit:contain;';
    _lightboxCaption = document.createElement('div');
    _lightboxCaption.style.cssText =
      'position:absolute;bottom:calc(40px + env(safe-area-inset-bottom));color:white;font-size:0.85rem;text-align:center;width:100%;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00D7';
    closeBtn.style.cssText =
      'position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.2);border:none;color:white;font-size:1.5rem;cursor:pointer;width:40px;height:40px;border-radius:50%;';
    closeBtn.addEventListener('click', closeLightbox);
    _lightboxEl.appendChild(_lightboxImg);
    _lightboxEl.appendChild(_lightboxCaption);
    _lightboxEl.appendChild(closeBtn);
    _lightboxEl.addEventListener('click', (e) => {
      if (e.target === _lightboxEl) closeLightbox();
    });
    document.body.appendChild(_lightboxEl);
  }

  if (!_lightboxImg) {
    _lightboxImg =
      document.getElementById('incid-detail__lightbox-img') ||
      document.getElementById('fd-lightbox-img') ||
      _lightboxEl.querySelector('img');
  }
  if (!_lightboxCaption) {
    _lightboxCaption =
      document.getElementById('incid-detail__lightbox-caption') ||
      document.getElementById('fd-lightbox-caption') ||
      _lightboxEl.querySelector('div:last-child');
  }

  if (_lightboxImg) {
    _lightboxImg.src = src;
    _lightboxImg.alt = caption;
  }
  if (_lightboxCaption) _lightboxCaption.textContent = caption;

  _lightboxEl.classList.remove('d-none');

  if (!_boundEscape) {
    _boundEscape = (e) => {
      if (e.key === 'Escape') closeLightbox();
    };
  }
  document.addEventListener('keydown', _boundEscape);
}

export function closeLightbox() {
  if (_lightboxEl) {
    _lightboxEl.classList.add('d-none');
    if (_lightboxImg) _lightboxImg.src = '';
  }
  if (_boundEscape) {
    document.removeEventListener('keydown', _boundEscape);
  }
}
