import { describe, it, expect, beforeEach, vi } from 'vitest';
import resetPasswordComponent from './reset-password.component.js';
import { http } from '../../../core/http.service.js';
import { router } from '../../../core/router.js';

vi.mock('../../../core/http.service.js', () => ({
  http: {
    post: vi.fn(),
  },
}));

vi.mock('../../../core/router.js', () => ({
  router: {
    navigate: vi.fn(),
  },
}));

describe('ResetPasswordComponent', () => {
  beforeEach(() => {
    document.body.innerHTML = resetPasswordComponent.template;
    vi.clearAllMocks();
  });

  it('shows error if token or email are missing from query', async () => {
    const query = new URLSearchParams('');
    await resetPasswordComponent.onInit({ query });

    expect(
      document.getElementById('estado-error').classList.contains('d-none'),
    ).toBe(false);
    expect(document.getElementById('error-texto').textContent).toContain(
      'Enlace inválido',
    );
    expect(
      document
        .getElementById('reset-form')
        .querySelector('button[type="submit"]').disabled,
    ).toBe(true);
  });

  it('shows error if passwords do not match', async () => {
    const query = new URLSearchParams('token=xyz123&email=user@example.com');
    await resetPasswordComponent.onInit({ query });

    document.getElementById('password').value = 'newsecret123';
    document.getElementById('password-confirm').value = 'mismatch123';

    const form = document.getElementById('reset-form');
    form.dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true }),
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(
      document.getElementById('estado-error').classList.contains('d-none'),
    ).toBe(false);
    expect(document.getElementById('error-texto').textContent).toBe(
      'Las contraseñas no coinciden.',
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('resets password successfully when valid payload is provided', async () => {
    vi.useFakeTimers();
    http.post.mockResolvedValueOnce({ message: 'Contraseña restablecida.' });

    const query = new URLSearchParams(
      'token=validtoken123&email=user@example.com',
    );
    await resetPasswordComponent.onInit({ query });

    document.getElementById('password').value = 'newsecret123';
    document.getElementById('password-confirm').value = 'newsecret123';

    const form = document.getElementById('reset-form');
    form.dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true }),
    );

    await vi.runAllTimersAsync();

    expect(http.post).toHaveBeenCalledWith('/reset-password', {
      token: 'validtoken123',
      email: 'user@example.com',
      password: 'newsecret123',
      password_confirmation: 'newsecret123',
    });
    expect(
      document.getElementById('estado-exito').classList.contains('d-none'),
    ).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith('/login');

    vi.useRealTimers();
  });
});
