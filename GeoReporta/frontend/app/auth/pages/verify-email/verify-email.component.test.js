/**
 * verify-email.component.test.js — story sc-117
 *
 * Cubre los flujos clave del landing de verificación OTP con 6 celdas:
 *
 *   1. Mount: aparecen el banner inicial y los botones de reenvío.
 *   2. POST /email/resend al hacer click en "Reenviar código".
 *   3. Submit completo: las 6 celdas concatenadas van a /email/verify-otp.
 *   4. Submit incompleto: marca celdas vacías con --error y muestra
 *      banner de error SIN shake.
 *   5. Backend 422: marca las 6 celdas con --error y muestra banner.
 *   6. Autoadvance: tipear dígito en una celda mueve foco a la siguiente.
 *   7. Paste: un código de 6 dígitos se distribuye entre las 6 celdas.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import verifyEmailComponent from './verify-email.component.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_HTML = readFileSync(
  resolve(__dirname, 'verify-email.component.html'),
  'utf8',
);

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../../core/http.service.js', () => ({ http: httpMock }));

const routerMock = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock('../../../core/router.js', () => ({ router: routerMock }));

async function mountComponent(ctx = {}) {
  document.body.innerHTML = TEMPLATE_HTML;
  await verifyEmailComponent.onInit(ctx);
  return document.body;
}

function getCells() {
  return Array.from(document.querySelectorAll('.gr-otp__cell'));
}

function fillCells(code) {
  const cells = getCells();
  const digits = code.split('');
  cells.forEach((c, i) => {
    c.value = digits[i] || '';
  });
  return cells;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verify-email component — story sc-117', () => {
  it('renders the verification form with a reenviar button', async () => {
    await mountComponent();

    expect(document.getElementById('btn-reenviar')).not.toBeNull();
    expect(document.getElementById('estado-inicial')).not.toBeNull();
    expect(document.getElementById('estado-exito')).not.toBeNull();
    expect(document.getElementById('estado-error')).not.toBeNull();
  });

  it('shows the initial banner when mounting the component', async () => {
    await mountComponent({ query: new URLSearchParams() });

    const inicial = document.getElementById('estado-inicial');
    expect(inicial.classList.contains('d-none')).toBe(false);
  });

  it('renders six OTP cells with the right input attributes', async () => {
    await mountComponent();
    const cells = getCells();
    expect(cells).toHaveLength(6);
    cells.forEach((c, i) => {
      expect(c.getAttribute('inputmode')).toBe('numeric');
      expect(c.getAttribute('maxlength')).toBe('1');
      expect(c.getAttribute('aria-label')).toBe(`Dígito ${i + 1}`);
    });
    // First cell carries one-time-code for SMS autofill.
    expect(cells[0].getAttribute('autocomplete')).toBe('one-time-code');
    // The group is announced as a single labelled group.
    const group = cells[0].parentElement;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-labelledby')).toBe('otp-label');
  });

  it('sends POST /email/resend when the user clicks the reenviar button', async () => {
    httpMock.post.mockResolvedValueOnce({ message: 'Correo reenviado.' });

    await mountComponent({ query: new URLSearchParams() });

    const btn = document.getElementById('btn-reenviar');
    btn.click();

    await vi.waitFor(() => {
      expect(httpMock.post).toHaveBeenCalledTimes(1);
    });
    expect(httpMock.post).toHaveBeenCalledWith('/email/resend', { email: '' });

    const reenvioBanner = document.getElementById('estado-reenvio');
    expect(reenvioBanner.classList.contains('d-none')).toBe(false);
  });

  it('submits the 6-digit OTP code (concatenated from cells) on form submit', async () => {
    httpMock.post.mockResolvedValueOnce({
      message: 'Tu correo fue verificado correctamente.',
      verified: true,
    });

    await mountComponent({
      query: new URLSearchParams('email=user@example.com'),
    });

    fillCells('123456');

    document
      .getElementById('form-otp')
      .dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitFor(() => {
      expect(httpMock.post).toHaveBeenCalledTimes(1);
    });
    expect(httpMock.post).toHaveBeenCalledWith('/email/verify-otp', {
      email: 'user@example.com',
      otp: '123456',
    });

    const exitoBanner = document.getElementById('estado-exito');
    expect(exitoBanner.classList.contains('d-none')).toBe(false);
  });

  it('shows error banner and marks empty cells when submitting incomplete code', async () => {
    await mountComponent({
      query: new URLSearchParams('email=user@example.com'),
    });

    const cells = fillCells('123');

    document
      .getElementById('form-otp')
      .dispatchEvent(new Event('submit', { cancelable: true }));

    // No API call: validation fails client-side.
    expect(httpMock.post).not.toHaveBeenCalled();

    const errorBanner = document.getElementById('estado-error');
    expect(errorBanner.classList.contains('d-none')).toBe(false);

    // Empty cells (3,4,5) carry the error class; filled cells (0,1,2) do not.
    expect(cells[0].classList.contains('gr-otp__cell--error')).toBe(false);
    expect(cells[1].classList.contains('gr-otp__cell--error')).toBe(false);
    expect(cells[2].classList.contains('gr-otp__cell--error')).toBe(false);
    expect(cells[3].classList.contains('gr-otp__cell--error')).toBe(true);
    expect(cells[4].classList.contains('gr-otp__cell--error')).toBe(true);
    expect(cells[5].classList.contains('gr-otp__cell--error')).toBe(true);
  });

  it('marks all six cells with error state when backend rejects the code', async () => {
    httpMock.post.mockRejectedValueOnce({
      status: 422,
      message: 'El código OTP es inválido o ha expirado.',
    });

    await mountComponent({
      query: new URLSearchParams('email=user@example.com'),
    });

    const cells = fillCells('123456');

    document
      .getElementById('form-otp')
      .dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitFor(() => {
      expect(httpMock.post).toHaveBeenCalledTimes(1);
    });

    const errorBanner = document.getElementById('estado-error');
    expect(errorBanner.classList.contains('d-none')).toBe(false);

    cells.forEach((c) => {
      expect(c.classList.contains('gr-otp__cell--error')).toBe(true);
    });

    const group = cells[0].parentElement;
    expect(group.classList.contains('gr-otp__cells--shake')).toBe(true);
  });

  it('advances focus to the next cell when the user types a digit', async () => {
    await mountComponent({
      query: new URLSearchParams('email=user@example.com'),
    });

    const cells = getCells();
    cells[0].focus();

    cells[0].value = '1';
    cells[0].dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.activeElement).toBe(cells[1]);
  });

  it('distributes a pasted code across all six cells', async () => {
    await mountComponent({
      query: new URLSearchParams('email=user@example.com'),
    });

    const cells = getCells();

    const pasteEvent = new Event('paste', {
      cancelable: true,
      bubbles: true,
    });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        getData: (type) =>
          type === 'text' || type === 'text/plain' ? '654321' : '',
      },
    });
    cells[0].dispatchEvent(pasteEvent);

    expect(cells.map((c) => c.value).join('')).toBe('654321');
  });
});
