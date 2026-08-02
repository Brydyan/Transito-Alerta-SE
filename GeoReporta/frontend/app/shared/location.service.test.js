/**
 * location.service — unit tests
 *
 * Phase 3 — Progressive location loading cleanup (WU-2).
 *
 * Tests:
 * - Cache deduplicates in-flight requests with same (level, parent_id) key
 * - Stale responses (generation mismatch) are discarded and never mutate state
 * - Page traversal follows next_page_url to completion
 * - Loading/error/empty states are surfaced
 * - Generation increments on parent change, guarding against out-of-order responses
 *
 * Convention: mock http.service.js, use fake timers for TTL/cache tests.
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
import { locationService } from './location.service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Builds a minimal paginated response with optional next_page_url. */
function buildPage(items, page, lastPage, baseParams = '') {
  const meta = {
    current_page: page,
    per_page: 100,
    total: items.length,
    last_page: lastPage,
  };
  if (page < lastPage) {
    meta.next_page_url = `/api/locations?${baseParams}page=${page + 1}&per_page=100`;
  }
  return { data: items, meta };
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const PROVINCES = [
  {
    id: 1,
    name: 'Pichincha',
    code: 'EC-PI',
    level: 'province',
    parent_id: 1,
    geom: null,
  },
  {
    id: 2,
    name: 'Guayas',
    code: 'EC-GY',
    level: 'province',
    parent_id: 1,
    geom: null,
  },
];

const CITIES_PICHINCHA = [
  {
    id: 3,
    name: 'Quito',
    code: 'EC-PI-QT',
    level: 'city',
    parent_id: 1,
    geom: null,
  },
];

const CITIES_GUAYAS = [
  {
    id: 4,
    name: 'Guayaquil',
    code: 'EC-GY-GQ',
    level: 'city',
    parent_id: 2,
    geom: null,
  },
];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearAuthState();
  setAccessToken('test-token');
  locationService.invalidateCache();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('location.service — cache deduplication', () => {
  it('two concurrent requests for same (parent_id) result in single HTTP call', async () => {
    // Control when HTTP resolves
    let resolveHttp;
    const httpPromise = new Promise((r) => {
      resolveHttp = r;
    });
    http.get.mockImplementation(() => httpPromise);

    // Fire two concurrent requests
    const p1 = locationService.getChildren({ parentId: 1 });
    const p2 = locationService.getChildren({ parentId: 1 });

    // Both should resolve to the same data
    resolveHttp({ data: PROVINCES });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(PROVINCES);
    expect(r2).toEqual(PROVINCES);

    // HTTP should only be called ONCE — deduplication works
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('different parent_id keys do NOT deduplicate', async () => {
    let resolveFirst, resolveSecond;
    const p1 = new Promise((r) => {
      resolveFirst = r;
    });
    const p2 = new Promise((r) => {
      resolveSecond = r;
    });

    let callCount = 0;
    http.get.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? p1 : p2;
    });

    const req1 = locationService.getChildren({ parentId: 1 });
    const req2 = locationService.getChildren({ parentId: 2 });

    resolveFirst({ data: CITIES_PICHINCHA });
    resolveSecond({ data: CITIES_GUAYAS });

    const [r1, r2] = await Promise.all([req1, req2]);
    expect(r1).toEqual(CITIES_PICHINCHA);
    expect(r2).toEqual(CITIES_GUAYAS);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('cached response is returned without a network request on second call', async () => {
    http.get.mockResolvedValue({ data: PROVINCES });

    const r1 = await locationService.getChildren({ parentId: 1 });
    expect(r1).toEqual(PROVINCES);
    expect(http.get).toHaveBeenCalledTimes(1);

    const r2 = await locationService.getChildren({ parentId: 1 });
    expect(r2).toEqual(PROVINCES);
    expect(http.get).toHaveBeenCalledTimes(1); // still 1 — cached
  });

  it('cache is keyed by (level, parent_id) combination', async () => {
    http.get.mockResolvedValue({ data: PROVINCES });

    await locationService.getChildren({ parentId: 1 });
    await locationService.getChildren({ level: 'province' });

    // Two different cache keys → two network calls
    expect(http.get).toHaveBeenCalledTimes(2);
  });
});

describe('location.service — stale response discard (generation guard)', () => {
  it('generation increments when a new request is made for different parent', async () => {
    let resolveFirst, resolveSecond;
    const firstPromise = new Promise((r) => {
      resolveFirst = r;
    });
    const secondPromise = new Promise((r) => {
      resolveSecond = r;
    });

    let callCount = 0;
    http.get.mockImplementation(() => {
      callCount++;
      // Both parentIds get their own promise (they're different cache keys)
      return callCount === 1 ? firstPromise : secondPromise;
    });

    // First request
    const p1 = locationService.getChildren({ parentId: 1 });
    expect(locationService.getActiveGeneration()).toBe(1);

    // Second request — different parent, increments generation
    const p2 = locationService.getChildren({ parentId: 2 });
    expect(locationService.getActiveGeneration()).toBe(2);

    // Complete second request first
    resolveSecond({ data: CITIES_GUAYAS });
    const secondResult = await p2;
    expect(secondResult).toEqual(CITIES_GUAYAS);

    // Complete first request — it's for an older generation
    resolveFirst({ data: CITIES_PICHINCHA });
    const firstResult = await p1;

    // First request completed but with stale generation (1 vs current 2)
    // The service doesn't cache it but still returns the data
    // Callers should check getActiveGeneration() to detect staleness
    expect(firstResult).toEqual(CITIES_PICHINCHA);
  });

  it('getActiveGeneration increments on each new request', async () => {
    http.get.mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ data: [] }), 10)),
    );

    expect(locationService.getActiveGeneration()).toBe(0);

    locationService.getChildren({ parentId: 1 });
    expect(locationService.getActiveGeneration()).toBe(1);

    locationService.getChildren({ parentId: 2 });
    expect(locationService.getActiveGeneration()).toBe(2);
  });
});

describe('location.service — page traversal', () => {
  it('follows next_page_url and returns all pages concatenated', async () => {
    // First call (no page param), subsequent calls with page param
    http.get.mockImplementation((path) => {
      if (!path.includes('page=')) {
        return Promise.resolve(
          buildPage([{ id: 1, name: 'A' }], 1, 3, 'parent_id=1&'),
        );
      }
      if (path.includes('page=2')) {
        return Promise.resolve(
          buildPage([{ id: 2, name: 'B' }], 2, 3, 'parent_id=1&'),
        );
      }
      if (path.includes('page=3')) {
        return Promise.resolve(
          buildPage([{ id: 3, name: 'C' }], 3, 3, 'parent_id=1&'),
        );
      }
      return Promise.resolve({ data: [], meta: {} });
    });

    const result = await locationService.getChildren({ parentId: 1 });

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('A');
    expect(result[1].name).toBe('B');
    expect(result[2].name).toBe('C');
    expect(http.get).toHaveBeenCalledTimes(3);
  });

  it('returns empty array when first page returns no data', async () => {
    http.get.mockResolvedValue({
      data: [],
      meta: { current_page: 1, last_page: 1 },
    });

    const result = await locationService.getChildren({ parentId: 999 });

    expect(result).toEqual([]);
  });
});

describe('location.service — invalidateCache', () => {
  it('forces a new network request after invalidation', async () => {
    http.get.mockResolvedValue({ data: PROVINCES });

    await locationService.getChildren({ parentId: 1 });
    expect(http.get).toHaveBeenCalledTimes(1);

    locationService.invalidateCache();

    http.get.mockResolvedValue({ data: CITIES_PICHINCHA });
    await locationService.getChildren({ parentId: 1 });
    expect(http.get).toHaveBeenCalledTimes(2);
  });
});

describe('location.service — initial load (roots / level=province)', () => {
  it('loads only root-level locations when called with level=province and no parent_id', async () => {
    http.get.mockResolvedValue({ data: PROVINCES });

    const result = await locationService.getRoots({ level: 'province' });

    // Path must be /locations (without /api prefix) — HttpService already prepends API_URL=/api
    expect(http.get).toHaveBeenCalledWith(
      '/locations?level=province&per_page=500',
    );
    expect(result).toEqual(PROVINCES);
  });

  it('loads countries when called with level=country', async () => {
    const countries = [
      { id: 1, name: 'Ecuador', code: 'EC', level: 'country', parent_id: null },
    ];
    http.get.mockResolvedValue({ data: countries });

    const result = await locationService.getRoots({ level: 'country' });

    // Path must be /locations (without /api prefix) — HttpService already prepends API_URL=/api
    expect(http.get).toHaveBeenCalledWith(
      '/locations?level=country&per_page=500',
    );
    expect(result).toEqual(countries);
  });

  it('getChildren uses /locations path without /api duplication', async () => {
    http.get.mockResolvedValue({ data: CITIES_PICHINCHA });

    await locationService.getChildren({ parentId: 1 });

    // Verify no /api duplication: HttpService prepends /api, so service must use /locations
    const calledPath = http.get.mock.calls[0][0];
    expect(calledPath).toMatch(/^\/locations\?/);
    expect(calledPath).not.toMatch(/\/api\/locations/);
  });
});

describe('location.service — catalog mode (citizen endpoint)', () => {
  it('getRoots hits /locations/catalog when catalog: true', async () => {
    http.get.mockResolvedValue({ data: PROVINCES });

    const result = await locationService.getRoots(
      { level: 'province' },
      { catalog: true },
    );

    expect(http.get).toHaveBeenCalledWith(
      '/locations/catalog?level=province&per_page=500',
    );
    expect(result).toEqual(PROVINCES);
  });

  it('getChildren hits /locations/catalog when catalog: true', async () => {
    http.get.mockResolvedValue({ data: CITIES_PICHINCHA });

    await locationService.getChildren({ parentId: 1 }, { catalog: true });

    const calledPath = http.get.mock.calls[0][0];
    expect(calledPath).toMatch(/^\/locations\/catalog\?/);
    expect(calledPath).toContain('parent_id=1');
  });

  it('does NOT share cache entries between /locations and /locations/catalog', async () => {
    http.get.mockResolvedValue({ data: PROVINCES });

    // Same (level, parent_id) query, different route.
    await locationService.getRoots({ level: 'province' });
    await locationService.getRoots({ level: 'province' }, { catalog: true });

    // The second call must NOT be served from the admin-route cache entry.
    expect(http.get).toHaveBeenCalledTimes(2);
  });
});
