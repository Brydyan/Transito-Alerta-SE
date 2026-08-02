/**
 * JustificacionRechazoModal — Bootstrap modal component for entering
 * a rejection reason (10–500 chars) before confirming a pending incident.
 *
 * This component does not perform HTTP calls itself; it collects a reason
 * and delegates to the parent via the callback passed to show().
 *
 * Usage:
 *   const modal = document.getElementById('justificacion-rechazo-modal');
 *   modal.show((reason) => { /* handle rejection *\/ });
 *
 * Events emitted:
 *   - 'confirm' with { detail: { reason } } when confirm is clicked with valid reason
 *   - 'cancel'  when the modal is dismissed
 *
 * @element justificacion-rechazo-modal
 */
class JustificacionRechazoModal extends HTMLElement {
  constructor() {
    super();
    this._reason = '';
    this._onConfirmCallback = null;
    this._confirmed = false;
    this._textareaId = `motivo-${Math.random().toString(36).slice(2, 10)}`;
  }

  connectedCallback() {
    this._render();
    this._bindEvents();
  }

  _render() {
    this.innerHTML = `
      <div class="modal fade" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Motivo del rechazo</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <label for="${this._textareaId}" class="form-label">
                Describe el motivo del rechazo (10–500 caracteres)
              </label>
              <textarea
                id="${this._textareaId}"
                class="form-control motivo-textarea"
                rows="4"
                placeholder="Ej: La descripción no es clara respecto a la ubicación exacta del incidente."
                minlength="10"
                maxlength="500"
              ></textarea>
              <div class="d-flex justify-content-end mt-1">
                <small class="text-muted char-counter">0 / 500</small>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-danger btn-confirmar-rechazo" disabled>Confirmar rechazo</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    const modal = this.querySelector('.modal');
    const textarea = this.querySelector(`#${this._textareaId}`);
    const counter = this.querySelector('.char-counter');
    const confirmarBtn = this.querySelector('.btn-confirmar-rechazo');
    // Bind cancel handler to ALL dismiss elements (X button + Cancelar button).
    // In real Bootstrap the data-bs-dismiss data-API handles this automatically,
    // but tests run against a mocked Bootstrap that only exposes Modal class —
    // so we wire it explicitly so clicking either close control hides the modal.
    const dismissBtns = this.querySelectorAll('[data-bs-dismiss="modal"]');

    textarea.addEventListener('input', () => {
      this._reason = textarea.value;
      // Counter shows the actual value length (including surrounding whitespace).
      counter.textContent = `${textarea.value.length} / 500`;

      const valid = this._isValid();
      confirmarBtn.disabled = !valid;
    });

    const hideModal = () => {
      bootstrap.Modal.getInstance(modal)?.hide();
    };
    dismissBtns.forEach((btn) => btn.addEventListener('click', hideModal));

    confirmarBtn.addEventListener('click', () => {
      if (!this._isValid()) return;
      const trimmedReason = this._reason.trim();
      // Mark confirmation BEFORE hide() so the hidden.bs.modal handler
      // does not also fire a cancel event. The flag is reset after the
      // cancel event handler completes its bookkeeping (see below).
      this._confirmed = true;
      if (this._onConfirmCallback) {
        this._onConfirmCallback(trimmedReason);
      }
      this.dispatchEvent(
        new CustomEvent('confirm', {
          bubbles: true,
          composed: true,
          detail: { reason: trimmedReason },
        }),
      );
      bootstrap.Modal.getInstance(modal)?.hide();
    });

    // Reset state when modal is closed
    modal.addEventListener('hidden.bs.modal', () => {
      this._reason = '';
      textarea.value = '';
      counter.textContent = '0 / 500';
      confirmarBtn.disabled = true;
      this._onConfirmCallback = null;

      // Only dispatch cancel if the user actually aborted (not after a
      // successful confirm). Reset state so the next show() starts fresh.
      if (!this._confirmed) {
        this.dispatchEvent(
          new CustomEvent('cancel', { bubbles: true, composed: true }),
        );
      }
      this._confirmed = false;
    });
  }

  _isValid() {
    const trimmed = this._reason.trim();
    return trimmed.length >= 10 && trimmed.length <= 500;
  }

  /**
   * Open the modal with an optional confirm callback.
   * @param {function(string): void} [callback] - receives the trimmed reason
   */
  show(callback) {
    this._onConfirmCallback = callback || null;
    this._confirmed = false;
    const modalEl = this.querySelector('.modal');
    const textarea = this.querySelector(`#${this._textareaId}`);
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Autofocus after modal is shown
    modalEl.addEventListener(
      'shown.bs.modal',
      () => {
        textarea.focus();
      },
      { once: true },
    );
  }

  /**
   * Public getter so consumers can read the reason without scraping the DOM.
   * @returns {string}
   */
  getReason() {
    return this._reason.trim();
  }

  /**
   * Close the modal programmatically.
   */
  hide() {
    const modalEl = this.querySelector('.modal');
    bootstrap.Modal.getInstance(modalEl)?.hide();
  }
}

customElements.define('justificacion-rechazo-modal', JustificacionRechazoModal);

export default JustificacionRechazoModal;
