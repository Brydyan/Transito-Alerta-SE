import { authGuard } from './auth.guard.js';
import { clearAuthState, setAccessToken } from '../core/http.service.js';

describe('authGuard', () => {
  beforeEach(() => {
    clearAuthState();
    window.location.hash = '';
  });

  it('redirects to login when the user is not authenticated', async () => {
    const canActivate = await authGuard.canActivate();

    expect(canActivate).toBe(false);
    expect(window.location.hash).toBe('#/login');
  });

  it('allows navigation when the user is authenticated', async () => {
    setAccessToken('access-token');

    await expect(authGuard.canActivate()).resolves.toBe(true);
    expect(window.location.hash).toBe('');
  });
});
