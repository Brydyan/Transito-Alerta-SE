import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAuthState, setAccessToken } from '../core/http.service.js';

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
import { permissionService } from './permission.service.js';

// We need to access internal state for testing — import the module and reach
// into the exported object.  The generation counter and _listeners are attached
// by the implementation; the test file documents the expected shape.
describe('permissionService PubSub extension', () => {
  beforeEach(() => {
    clearAuthState();
    setAccessToken('test-token');
    // Reset module-level state by calling the existing invalidate
    permissionService.invalidateMyPermissions();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // onInvalidate(cb) — subscribe / unsubscribe
  // -------------------------------------------------------------------------

  describe('onInvalidate', () => {
    it('returns a function', () => {
      const unsubscribe = permissionService.onInvalidate(() => {});
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('calls the callback when invalidateMyPermissions is called', () => {
      const cb = vi.fn();
      const unsubscribe = permissionService.onInvalidate(cb);
      permissionService.invalidateMyPermissions();
      expect(cb).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('does NOT call the callback after unsubscribe', () => {
      const cb = vi.fn();
      const unsubscribe = permissionService.onInvalidate(cb);
      unsubscribe();
      permissionService.invalidateMyPermissions();
      expect(cb).not.toHaveBeenCalled();
    });

    it('calls multiple subscribers when invalidateMyPermissions is called', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      permissionService.onInvalidate(cb1);
      permissionService.onInvalidate(cb2);
      permissionService.invalidateMyPermissions();
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('calls subscribers in registration order', () => {
      const callOrder = [];
      permissionService.onInvalidate(() => callOrder.push('first'));
      permissionService.onInvalidate(() => callOrder.push('second'));
      permissionService.invalidateMyPermissions();
      expect(callOrder).toEqual(['first', 'second']);
    });
  });

  // -------------------------------------------------------------------------
  // Generation race-guard
  // -------------------------------------------------------------------------

  describe('generation race-guard', () => {
    it('discards in-flight response when invalidate is called during the request', async () => {
      // Start a permission fetch that won't resolve immediately
      let resolveHttp;
      http.get.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveHttp = resolve;
          }),
      );

      // Kick off getMyPermissions — it will be in-flight
      const promise = permissionService.getMyPermissions();

      // While in-flight, invalidate (bump generation)
      permissionService.invalidateMyPermissions();

      // Now resolve the original request — it should be discarded
      resolveHttp({ data: ['incidents.update'] });
      const result = await promise;

      // The stale response was discarded, so we get null (no cache yet)
      // because invalidateMyPermissions also clears _cache and _inflight
      expect(result).toBeNull();
    });

    it('returns fresh data after invalidateMyPermissions when a new fetch completes', async () => {
      http.get.mockResolvedValue({
        data: ['incidents.update', 'incidents.delete'],
      });

      // First load
      const result1 = await permissionService.getMyPermissions();
      expect(result1).toBeInstanceOf(Set);
      expect(result1.has('incidents.update')).toBe(true);

      // Invalidate
      permissionService.invalidateMyPermissions();

      // New fetch returns different data
      http.get.mockResolvedValue({ data: ['incidents.view'] });
      const result2 = await permissionService.getMyPermissions();
      expect(result2.has('incidents.view')).toBe(true);
      expect(result2.has('incidents.update')).toBe(false); // stale data not used
    });
  });

  // -------------------------------------------------------------------------
  // Existing API is unchanged
  // -------------------------------------------------------------------------

  describe('existing API unchanged', () => {
    it('getMyPermissions returns a Set from the API', async () => {
      http.get.mockResolvedValue({ data: ['users.view', 'users.create'] });
      const result = await permissionService.getMyPermissions();
      expect(result).toBeInstanceOf(Set);
      expect([...result]).toEqual(['users.view', 'users.create']);
    });

    it('getMyPermissions reuses cache when fresh', async () => {
      http.get.mockResolvedValue({ data: ['users.view'] });
      await permissionService.getMyPermissions();
      await permissionService.getMyPermissions();
      expect(http.get).toHaveBeenCalledTimes(1);
    });

    it('getMyPermissions forces refresh when forceRefresh is true', async () => {
      http.get.mockResolvedValue({ data: ['users.view'] });
      await permissionService.getMyPermissions();
      http.get.mockResolvedValue({ data: ['users.update'] });
      await permissionService.getMyPermissions({ forceRefresh: true });
      expect(http.get).toHaveBeenCalledTimes(2);
    });

    it('invalidateMyPermissions clears cache', async () => {
      http.get.mockResolvedValue({ data: ['users.view'] });
      await permissionService.getMyPermissions();
      permissionService.invalidateMyPermissions();
      http.get.mockResolvedValue({ data: ['users.update'] });
      await permissionService.getMyPermissions();
      // Two calls means cache was cleared
      expect(http.get).toHaveBeenCalledTimes(2);
    });
  });
});
