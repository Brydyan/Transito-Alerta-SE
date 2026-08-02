/**
 * Role Guard unit tests — canActivate behavior by role.
 */
const mockAuth = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  getUser: vi.fn(),
  me: vi.fn(),
}));

vi.mock('./auth.service.js', () => ({ auth: mockAuth }));

import { roleGuard } from './role.guard.js';

describe('roleGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
  });

  // ──────────────────────────────────────────────────────────────
  // Unauthenticated
  // ──────────────────────────────────────────────────────────────

  it('redirects to login when user is not authenticated', async () => {
    mockAuth.isAuthenticated.mockReturnValue(false);

    const guard = roleGuard(['admin_sistema']);
    const result = await guard.canActivate();

    expect(result).toBe(false);
    expect(window.location.hash).toBe('#/login');
  });

  // ──────────────────────────────────────────────────────────────
  // Allowed role (as object { id, name })
  // ──────────────────────────────────────────────────────────────

  it('allows navigation when user has an allowed role', async () => {
    mockAuth.isAuthenticated.mockReturnValue(true);
    mockAuth.getUser.mockReturnValue({
      role: { id: 2, name: 'admin_sistema' },
    });

    const guard = roleGuard(['admin_sistema', 'admin_organizacion']);
    const result = await guard.canActivate();

    expect(result).toBe(true);
    expect(window.location.hash).toBe('');
  });

  // ──────────────────────────────────────────────────────────────
  // Disallowed role → redirect to feed
  // ──────────────────────────────────────────────────────────────

  it('redirects to feed when user role is not in the allowed list', async () => {
    mockAuth.isAuthenticated.mockReturnValue(true);
    mockAuth.getUser.mockReturnValue({ role: { id: 6, name: 'usuario' } });

    const guard = roleGuard(['admin_sistema', 'operador_organizacion']);
    const result = await guard.canActivate();

    expect(result).toBe(false);
    expect(window.location.hash).toBe('#/feed');
  });

  // ──────────────────────────────────────────────────────────────
  // Publicador can access pendientes route
  // ──────────────────────────────────────────────────────────────

  it('allows publicador role for pendientes route', async () => {
    mockAuth.isAuthenticated.mockReturnValue(true);
    mockAuth.getUser.mockReturnValue({ role: { id: 5, name: 'publicador' } });

    const guard = roleGuard(['publicador']);
    const result = await guard.canActivate();

    expect(result).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────
  // Fetches user via me() when not cached
  // ──────────────────────────────────────────────────────────────

  it('fetches user via me() when user is not yet cached', async () => {
    mockAuth.isAuthenticated.mockReturnValue(true);
    mockAuth.getUser.mockReturnValue(null);
    mockAuth.me.mockResolvedValue({
      role: { id: 4, name: 'operador_organizacion' },
    });

    const guard = roleGuard(['operador_organizacion']);
    const result = await guard.canActivate();

    expect(result).toBe(true);
    expect(mockAuth.me).toHaveBeenCalledOnce();
  });

  // ──────────────────────────────────────────────────────────────
  // Handles role as plain string (backward compatibility)
  // ──────────────────────────────────────────────────────────────

  it('handles role as a plain string', async () => {
    mockAuth.isAuthenticated.mockReturnValue(true);
    mockAuth.getUser.mockReturnValue({ role: 'admin_sistema' });

    const guard = roleGuard(['admin_sistema']);
    const result = await guard.canActivate();

    expect(result).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────
  // me() call fails → redirect to login
  // ──────────────────────────────────────────────────────────────

  it('redirects to login when me() call fails', async () => {
    mockAuth.isAuthenticated.mockReturnValue(true);
    mockAuth.getUser.mockReturnValue(null);
    mockAuth.me.mockRejectedValue(new Error('Network error'));

    const guard = roleGuard(['admin_sistema']);
    const result = await guard.canActivate();

    expect(result).toBe(false);
    expect(window.location.hash).toBe('#/login');
  });
});
