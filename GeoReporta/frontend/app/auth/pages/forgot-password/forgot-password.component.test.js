import { describe, it, expect, beforeEach, vi } from 'vitest';
import forgotPasswordComponent from './forgot-password.component.js';
import { http } from '../../../core/http.service.js';

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

describe('ForgotPasswordComponent', () => {
  beforeEach(() => {
    document.body.innerHTML = forgotPasswordComponent.template;
    vi.clearAllMocks();
  });

  it('renders forgot password form elements', () => {
    expect(document.getElementById('forgot-form')).not.toBeNull();
    expect(document.getElementById('email')).not.toBeNull();
    expect(document.getElementById('btn-enviar')).not.toBeNull();
  });

  it('submits valid email and shows success message', async () => {
    http.post.mockResolvedValueOnce({ message: 'Enlace enviado.' });
    await forgotPasswordComponent.onInit();

    const emailInput = document.getElementById('email');
    emailInput.value = 'user@example.com';

    const form = document.getElementById('forgot-form');
    form.dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true }),
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(http.post).toHaveBeenCalledWith('/forgot-password', {
      email: 'user@example.com',
    });
    expect(
      document.getElementById('estado-exito').classList.contains('d-none'),
    ).toBe(false);
    expect(emailInput.value).toBe('');
  });

  it('shows error message when API request fails', async () => {
    http.post.mockRejectedValueOnce({
      status: 400,
      response: { message: 'Error de servidor' },
    });
    await forgotPasswordComponent.onInit();

    const emailInput = document.getElementById('email');
    emailInput.value = 'user@example.com';

    const form = document.getElementById('forgot-form');
    form.dispatchEvent(
      new Event('submit', { cancelable: true, bubbles: true }),
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(http.post).toHaveBeenCalledWith('/forgot-password', {
      email: 'user@example.com',
    });
    expect(
      document.getElementById('estado-error').classList.contains('d-none'),
    ).toBe(false);
  });
});
