/**
 * auth.service tests — `logout()` cache invalidation contract
 * (T-2.10 / T-2.11 of menu-server-driven PR 2).
 *
 * Design Decision 6 + spec capability 5 (`menu-cache-invalidation`):
 *   `auth.logout()` MUST clear the menu cache BEFORE notifying
 *   subscribers, so any code observing the auth-state change sees a
 *   clean cache. Cache clear must also happen when the backend
 *   `POST /logout` call rejects (5xx, network error), because the
 *   local auth state still flips to logged-out regardless.
 *
 * We stub `menuService.invalidateMyMenu` via `vi.mock` so we can assert on
 * the spy directly. `http.post` is mocked through the existing
 * `http.service.js` module surface.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../core/http.service.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    setAccessToken: mod.setAccessToken,
    clearAuthState: mod.clearAuthState,
    http: {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue(null),
    },
  };
});

vi.mock('../shared/menu.service.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    menuService: {
      ...mod.menuService,
      invalidateMyMenu: vi.fn(),
      getMyMenu: vi.fn(),
    },
  };
});

vi.mock('../shared/permission.service.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    permissionService: {
      ...mod.permissionService,
      invalidateMyPermissions: vi.fn(),
      getMyPermissions: vi.fn(),
    },
  };
});

import { http } from '../core/http.service.js';
import { menuService } from '../shared/menu.service.js';
import { permissionService } from '../shared/permission.service.js';

describe('auth.logout() — cache invalidation (T-2.10 menu-server-driven)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    http.post.mockResolvedValue({ data: { ok: true } });
  });

  it('calls menuService.invalidateMyMenu() during logout', async () => {
    const { auth } = await import('./auth.service.js');
    await auth.logout();
    expect(menuService.invalidateMyMenu).toHaveBeenCalledTimes(1);
  });

  // Regression test — found live via Playwright while verifying the
  // permission.guard.js fix: logging out of an admin_sistema session and
  // into admin_organizacion within permissionService's TTL window let
  // permissionGuard check /roles/:id against the PREVIOUS user's cached
  // full permission set (admin_sistema's isAdmin bypass), incorrectly
  // allowing navigation the new user's real grants don't cover.
  it('calls permissionService.invalidateMyPermissions() during logout', async () => {
    const { auth } = await import('./auth.service.js');
    await auth.logout();
    expect(permissionService.invalidateMyPermissions).toHaveBeenCalledTimes(1);
  });

  it('still clears the menu cache when POST /logout rejects (5xx)', async () => {
    // The current logout() wraps http.post in a try/catch so a backend
    // failure does NOT bypass local state cleanup. This test pins the
    // contract: cache must be cleared even when the server call fails.
    http.post.mockRejectedValueOnce(new Error('500 Internal Server Error'));
    const { auth } = await import('./auth.service.js');
    await expect(auth.logout()).resolves.toBeUndefined();
    expect(menuService.invalidateMyMenu).toHaveBeenCalledTimes(1);
  });

  it('still clears the menu cache when POST /logout rejects with a network error', async () => {
    http.post.mockRejectedValueOnce(new TypeError('NetworkError'));
    const { auth } = await import('./auth.service.js');
    await expect(auth.logout()).resolves.toBeUndefined();
    expect(menuService.invalidateMyMenu).toHaveBeenCalledTimes(1);
  });

  it('calls invalidateMyMenu BEFORE notifying auth-change subscribers', async () => {
    const { auth } = await import('./auth.service.js');
    const events = [];
    const subscriber = vi.fn(() => {
      events.push('subscriber');
    });
    menuService.invalidateMyMenu.mockImplementation(() => {
      events.push('menu.invalidateMyMenu');
    });
    auth.onAuthChange(subscriber);

    await auth.logout();

    // The menu cache clear must run before the subscriber observes the
    // auth state change. If a subscriber queries menuService after the
    // notification, it must see a fresh cache.
    expect(events).toEqual(['menu.invalidateMyMenu', 'subscriber']);
  });
});
