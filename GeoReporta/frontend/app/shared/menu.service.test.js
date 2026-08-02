import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setAccessToken, clearAuthState } from '../core/http.service.js';

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

import { http } from '../core/http.service.js';
import { menuService } from './menu.service.js';

describe('menuService', () => {
  beforeEach(() => {
    clearAuthState();
    setAccessToken('test-token');
    menuService.invalidateMyMenu();
    vi.clearAllMocks();
  });

  it('fetches /menus/my and returns the data array', async () => {
    const tree = [
      {
        id: 1,
        parent_id: null,
        name: 'Dashboard',
        route: '/dashboard',
        icon: 'fa-gauge',
        children: [],
      },
      {
        id: 2,
        parent_id: null,
        name: 'Incidencias',
        route: null,
        icon: 'fa-pin',
        children: [
          {
            id: 3,
            parent_id: 2,
            name: 'Lista',
            route: '/incidencias',
            icon: 'fa-list',
            children: [],
          },
        ],
      },
    ];
    http.get.mockResolvedValue({ data: tree });

    const result = await menuService.getMyMenu();

    expect(http.get).toHaveBeenCalledWith('/menus/my');
    expect(result).toEqual(tree);
  });

  it('caches the response and does not refetch on subsequent calls', async () => {
    http.get.mockResolvedValue({
      data: [{ id: 1, name: 'X', route: '/x', icon: null, children: [] }],
    });

    await menuService.getMyMenu();
    await menuService.getMyMenu();
    await menuService.getMyMenu();

    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('invalidateMyMenu forces a new fetch on the next call', async () => {
    http.get.mockResolvedValue({ data: [] });

    await menuService.getMyMenu();
    menuService.invalidateMyMenu();
    await menuService.getMyMenu();

    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('handles missing data field gracefully (returns empty array)', async () => {
    http.get.mockResolvedValue({});

    const result = await menuService.getMyMenu();

    expect(result).toEqual([]);
  });

  // ─── R-23: cache TTL + invalidation ────────────────────────────────

  it('refetches after the TTL window expires (default 5 minutes)', async () => {
    vi.useFakeTimers();
    try {
      // Initial grant: only the citizen menu
      http.get.mockResolvedValueOnce({
        data: [
          { id: 1, name: 'Feed', route: '/feed', icon: null, children: [] },
        ],
      });
      const first = await menuService.getMyMenu();
      expect(first[0].route).toBe('/feed');
      expect(http.get).toHaveBeenCalledTimes(1);

      // Admin grants the user the /usuarios permission.
      // The cache still serves the OLD menu for the TTL window.
      vi.advanceTimersByTime(4 * 60 * 1000);
      const stillCached = await menuService.getMyMenu();
      expect(stillCached[0].route).toBe('/feed');
      expect(http.get).toHaveBeenCalledTimes(1);

      // After the TTL window elapses, the next call MUST re-fetch.
      http.get.mockResolvedValueOnce({
        data: [
          { id: 1, name: 'Feed', route: '/feed', icon: null, children: [] },
          {
            id: 2,
            name: 'Usuarios',
            route: '/usuarios',
            icon: null,
            children: [],
          },
        ],
      });
      vi.advanceTimersByTime(2 * 60 * 1000); // total > 5 min
      const refreshed = await menuService.getMyMenu();
      expect(refreshed.some((n) => n.route === '/usuarios')).toBe(true);
      expect(http.get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('forceRefresh option bypasses cache even when fresh', async () => {
    http.get.mockResolvedValueOnce({
      data: [{ id: 1, name: 'A', route: '/a', icon: null, children: [] }],
    });
    await menuService.getMyMenu();
    expect(http.get).toHaveBeenCalledTimes(1);

    http.get.mockResolvedValueOnce({
      data: [{ id: 2, name: 'B', route: '/b', icon: null, children: [] }],
    });
    const refreshed = await menuService.getMyMenu({ forceRefresh: true });
    expect(refreshed[0].route).toBe('/b');
    expect(http.get).toHaveBeenCalledTimes(2);
  });
});
