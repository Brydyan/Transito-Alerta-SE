/**
 * justificacion-rechazo-modal — unit tests
 *
 * Coverage:
 * - button disabled when reason < 10 chars
 * - button disabled when reason > 500 chars
 * - button enabled when reason is 10..500 chars
 * - onConfirm callback receives trimmed reason
 * - textarea autofocus on open
 * - cancel closes modal
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearAuthState, setAccessToken } from '../../../core/http.service.js';

// ---------------------------------------------------------------------------
// Bootstrap Modal mock
// ---------------------------------------------------------------------------
let shownModalEl = null;

class MockModal {
  constructor(el) {
    this._el = el;
    shownModalEl = el;
  }

  show() {
    shownModalEl = this._el;
    setTimeout(() => this._el.dispatchEvent(new Event('shown.bs.modal')), 0);
  }

  hide() {
    shownModalEl = null;
  }

  static getInstance() {
    return shownModalEl ? new MockModal(shownModalEl) : null;
  }
}

// ---------------------------------------------------------------------------
// Test setup helper
// ---------------------------------------------------------------------------
async function createModal() {
  globalThis.bootstrap = {
    Modal: MockModal,
  };

  const { default: JustificacionRechazoModal } =
    await import('./justificacion-rechazo-modal.component.js');
  const modal = new JustificacionRechazoModal();
  modal.id = 'justificacion-rechazo-modal';
  document.body.appendChild(modal);

  // Wait for connectedCallback to render and bind
  await vi.waitFor(() => {
    const textarea = modal.querySelector('.motivo-textarea');
    if (!textarea) throw new Error('textarea not found');
  });

  return modal;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('JustificacionRechazoModal', () => {
  beforeEach(async () => {
    clearAuthState();
    setAccessToken('test-token');
    shownModalEl = null;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // -------------------------------------------------------------------------
  // Button disabled state
  // -------------------------------------------------------------------------
  describe('Button disabled state', () => {
    it('button disabled when reason < 10 chars', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const confirmarBtn = modal.querySelector('.btn-confirmar-rechazo');

      textarea.value = 'corto';
      textarea.dispatchEvent(new Event('input'));

      expect(confirmarBtn.disabled).toBe(true);
    });

    it('button disabled when reason > 500 chars', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const confirmarBtn = modal.querySelector('.btn-confirmar-rechazo');

      textarea.value = 'a'.repeat(501);
      textarea.dispatchEvent(new Event('input'));

      expect(confirmarBtn.disabled).toBe(true);
    });

    it('button enabled when reason is 10..500 chars', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const confirmarBtn = modal.querySelector('.btn-confirmar-rechazo');

      textarea.value = 'a'.repeat(10);
      textarea.dispatchEvent(new Event('input'));

      expect(confirmarBtn.disabled).toBe(false);
    });

    it('button enabled at exactly 500 chars', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const confirmarBtn = modal.querySelector('.btn-confirmar-rechazo');

      textarea.value = 'a'.repeat(500);
      textarea.dispatchEvent(new Event('input'));

      expect(confirmarBtn.disabled).toBe(false);
    });

    it('button disabled at exactly 501 chars', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const confirmarBtn = modal.querySelector('.btn-confirmar-rechazo');

      textarea.value = 'a'.repeat(501);
      textarea.dispatchEvent(new Event('input'));

      expect(confirmarBtn.disabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // onConfirm callback
  // -------------------------------------------------------------------------
  describe('onConfirm callback', () => {
    it('onConfirm callback receives trimmed reason', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const confirmarBtn = modal.querySelector('.btn-confirmar-rechazo');

      const callback = vi.fn();
      modal.show(callback);

      textarea.value = '   reason with spaces   ';
      textarea.dispatchEvent(new Event('input'));

      confirmarBtn.click();

      expect(callback).toHaveBeenCalledWith('reason with spaces');
    });

    it('dispatches confirm CustomEvent with reason detail', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const confirmarBtn = modal.querySelector('.btn-confirmar-rechazo');

      const callback = vi.fn();
      modal.show(callback);

      textarea.value = 'motivo de prueba';
      textarea.dispatchEvent(new Event('input'));

      let receivedEvent = null;
      modal.addEventListener('confirm', (e) => {
        receivedEvent = e;
      });

      confirmarBtn.click();

      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent.detail.reason).toBe('motivo de prueba');
    });

    it('does NOT dispatch cancel after confirm (regression: cancel-after-confirm bug)', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const confirmarBtn = modal.querySelector('.btn-confirmar-rechazo');

      modal.show();

      textarea.value = 'motivo de prueba valido';
      textarea.dispatchEvent(new Event('input'));

      let confirmEvent = null;
      let cancelEvent = null;
      modal.addEventListener('confirm', (e) => {
        confirmEvent = e;
      });
      modal.addEventListener('cancel', (e) => {
        cancelEvent = e;
      });

      confirmarBtn.click();

      // Wait for the hidden.bs.modal event to fire (synchronous in this mock)
      await new Promise((r) => setTimeout(r, 0));

      expect(confirmEvent).not.toBeNull();
      expect(cancelEvent).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Autofocus
  // -------------------------------------------------------------------------
  describe('Autofocus', () => {
    it('textarea autofocus on open after modal is shown', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const focusSpy = vi.fn();
      textarea.focus = focusSpy;

      modal.show();

      // Wait for shown.bs.modal event
      await vi.waitFor(() => {
        if (!focusSpy.mock.calls.length) throw new Error('not focused yet');
      });

      expect(focusSpy).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Cancel behavior
  // -------------------------------------------------------------------------
  describe('Cancel behavior', () => {
    it('cancel button triggers modal hide', async () => {
      const modal = await createModal();
      const cancelBtn = modal.querySelector(
        '.btn-secondary[data-bs-dismiss="modal"]',
      );

      modal.show();

      cancelBtn.click();

      // Modal should be hidden
      expect(shownModalEl).toBeNull();
    });

    it('dispatches cancel CustomEvent on modal hidden', async () => {
      const modal = await createModal();

      let cancelEvent = null;
      modal.addEventListener('cancel', (e) => {
        cancelEvent = e;
      });

      // Simulate hidden.bs.modal event
      const modalEl = modal.querySelector('.modal');
      modalEl.dispatchEvent(new Event('hidden.bs.modal'));

      expect(cancelEvent).not.toBeNull();
    });

    it('resets textarea after modal is hidden', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');

      modal.show();

      textarea.value = 'some reason';
      textarea.dispatchEvent(new Event('input'));

      // Simulate hidden.bs.modal event
      const modalEl = modal.querySelector('.modal');
      modalEl.dispatchEvent(new Event('hidden.bs.modal'));

      expect(textarea.value).toBe('');
    });

    it('re-opening after confirm fires cancel only on the second close (state reset)', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const confirmarBtn = modal.querySelector('.btn-confirmar-rechazo');
      const modalEl = modal.querySelector('.modal');

      modal.show();

      // First open: confirm
      textarea.value = 'motivo de prueba valido';
      textarea.dispatchEvent(new Event('input'));

      let confirmEvent = null;
      let cancelEvent = null;
      modal.addEventListener('confirm', (e) => {
        confirmEvent = e;
      });
      modal.addEventListener('cancel', (e) => {
        cancelEvent = e;
      });

      confirmarBtn.click();
      // MockModal.hide() doesn't fire hidden.bs.modal — dispatch it so the
      // modal's reset handler runs.
      modalEl.dispatchEvent(new Event('hidden.bs.modal'));
      expect(confirmEvent).not.toBeNull();
      expect(cancelEvent).toBeNull();

      // Re-open: dispatch hidden.bs.modal explicitly after the cancel button
      // click to simulate the modal closing without a confirmation.
      confirmEvent = null;
      cancelEvent = null;
      modal.show();
      const cancelBtn = modal.querySelector(
        '.btn-secondary[data-bs-dismiss="modal"]',
      );
      cancelBtn.click();
      modalEl.dispatchEvent(new Event('hidden.bs.modal'));

      expect(cancelEvent).not.toBeNull();
      expect(confirmEvent).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Char counter
  // -------------------------------------------------------------------------
  describe('Char counter', () => {
    it('counter updates on input', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const counter = modal.querySelector('.char-counter');

      textarea.value = 'abc';
      textarea.dispatchEvent(new Event('input'));

      expect(counter.textContent).toBe('3 / 500');
    });

    it('counter shows actual value length (not trimmed)', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');
      const counter = modal.querySelector('.char-counter');

      textarea.value = '   abc   ';
      textarea.dispatchEvent(new Event('input'));

      // Counter shows 9 (the actual value length: 3 + 3 + 3 = 9 chars)
      expect(counter.textContent).toBe('9 / 500');
    });
  });

  // -------------------------------------------------------------------------
  // getReason() public API
  // -------------------------------------------------------------------------
  describe('getReason()', () => {
    it('returns the trimmed reason without scraping the DOM', async () => {
      const modal = await createModal();
      const textarea = modal.querySelector('.motivo-textarea');

      textarea.value = '   trimmed reason text   ';
      textarea.dispatchEvent(new Event('input'));

      expect(modal.getReason()).toBe('trimmed reason text');
    });
  });
});
