/**
 * Page-level UI helpers shared by the CRUD pages (configuración e
 * incidencias). They replace per-component copies that had drifted only in
 * a null guard and, in roles.detail, a set of extra positioning classes —
 * covered here by the null guard (always on) and `extraClasses`.
 *
 * DOM contract (same ids every page template already uses):
 *   - #toast-msg / #toast-msg-texto  → mostrarToast
 *   - #estado-cargando / #estado-vacio / #estado-error / #contenedor-tabla
 *                                     → mostrarEstado
 */

export function mostrarToast(mensaje, tipo, extraClasses = '') {
  const el = document.getElementById('toast-msg');
  if (!el) return;
  el.className =
    `toast align-items-center text-white border-0 bg-${tipo}` +
    (extraClasses ? ` ${extraClasses}` : '');
  document.getElementById('toast-msg-texto').textContent = mensaje;
  new bootstrap.Toast(el, { delay: 3000 }).show();
}

export function mostrarEstado(cual) {
  ['cargando', 'vacio', 'error', 'tabla'].forEach((s) => {
    const el = document.getElementById(
      s === 'tabla' ? 'contenedor-tabla' : 'estado-' + s,
    );
    if (el) el.classList.toggle('d-none', s !== cual);
  });
}

export function isDesktop() {
  return window.matchMedia('(min-width: 768px)').matches;
}

/** Single source of truth for valid phone input regex pattern in JS. */
export const PHONE_REGEX = /^[0-9+\s()-]+$/;

/** Attach real-time input listener to strip invalid phone characters. */
export function maskPhoneInput(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener('input', function () {
    this.value = this.value.replace(/[^\d+-\s()]/g, '');
  });
}
