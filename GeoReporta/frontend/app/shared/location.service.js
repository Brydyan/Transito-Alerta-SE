/**
 * Location Service — progressive, parent-scoped location loading.
 *
 * Design (see SDD progressive-location-loading-cleanup):
 * - Shared service for all location-dependent components
 * - Cache by query key (level, parent_id) — survives across component re-renders
 * - In-flight deduplication — concurrent requests for same key share one promise
 * - Page traversal — follows next_page_url to completion, no truncation
 * - Generation-based race safety — stale responses are discarded
 * - Explicit invalidation for cache busting
 *
 * Used by:
 * - Dashboard filter (initial provinces load)
 * - Location Administration tree (lazy expansion)
 * - Organization form (cascade preselection) — WU-2 only, not yet migrated
 * - Incident form (cascade + geom) — WU-2 only, not yet migrated
 */

import { http } from '../core/http.service.js';

/**
 * @typedef {Object} LocationQuery
 * @property {number|null} parentId  — direct children of this parent
 * @property {string|null} level     — filter by level (country, province, city, neighborhood)
 */

/**
 * @typedef {Object} CacheEntry
 * @property {LocationQuery} query
 * @property {object[]}         data
 * @property {number}          generation  — generation when this entry was created
 */

class LocationService {
  constructor() {
    /** @type {Map<string, CacheEntry>} */
    this._cache = new Map();
    /** @type {Map<string, Promise<object[]>>} */
    this._inflight = new Map();
    /** @type {number} */
    this._currentGeneration = 0;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Load root-level locations (countries or provinces).
   * Uses level filter to avoid full tree downloads.
   *
   * @param {{ level: string }} opts
   * @param {{ catalog?: boolean }} [extra] — catalog:true hits the
   *   citizen-facing /locations/catalog endpoint (no administrative
   *   locations.view permission required), used by the incident form.
   * @returns {Promise<object[]>}
   */
  async getRoots({ level }, { catalog = false } = {}) {
    return this._fetch(
      { parentId: null, level },
      catalog ? '/locations/catalog' : '/locations',
    );
  }

  /**
   * Load direct children of a parent location.
   * Uses parent_id filter for direct-children-only queries.
   *
   * @param {LocationQuery} opts
   * @param {{ catalog?: boolean }} [extra] — catalog:true hits the
   *   citizen-facing /locations/catalog endpoint.
   * @returns {Promise<object[]>}
   */
  async getChildren({ parentId, level }, { catalog = false } = {}) {
    return this._fetch(
      { parentId, level: level ?? null },
      catalog ? '/locations/catalog' : '/locations',
    );
  }

  /**
   * Current active generation number.
   * Increments each time a new request is initiated.
   * Used by callers to detect superseded requests.
   *
   * @returns {number}
   */
  getActiveGeneration() {
    return this._currentGeneration;
  }

  /**
   * Discard all cached data and in-flight requests.
   */
  invalidateCache() {
    this._cache.clear();
    this._inflight.clear();
    this._currentGeneration = 0;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Build a stable cache key from query params + base path.
   * The base path matters: `/locations` (admin) and `/locations/catalog`
   * (citizen) may be queried with the same (level, parent_id) but return
   * differently-authorized data, so they must not share a cache entry.
   * @param {LocationQuery} query
   * @param {string} basePath
   * @returns {string}
   */
  _cacheKey(query, basePath) {
    return JSON.stringify({
      basePath,
      parentId: query.parentId ?? null,
      level: query.level ?? null,
    });
  }

  /**
   * Build URLSearchParams from query, applying per_page defaults.
   * @param {LocationQuery} query
   * @returns {URLSearchParams}
   */
  _buildParams(query) {
    const params = new URLSearchParams();
    if (query.parentId != null) {
      params.set('parent_id', String(query.parentId));
    }
    if (query.level != null) {
      params.set('level', query.level);
      // Default to 500 for level-only queries (province/country initial load)
      params.set('per_page', '500');
    }
    return params;
  }

  /**
   * Core fetch with cache, in-flight deduplication, page traversal, and
   * generation-based stale response protection.
   *
   * @param {LocationQuery} query
   * @param {string} basePath
   * @returns {Promise<object[]>}
   */
  _fetch(query, basePath) {
    const key = this._cacheKey(query, basePath);

    // Check cache first
    const cached = this._cache.get(key);
    if (cached) {
      return Promise.resolve(cached.data);
    }

    // Deduplicate in-flight requests
    if (this._inflight.has(key)) {
      return this._inflight.get(key);
    }

    // Increment generation for this new request
    this._currentGeneration++;
    const requestGeneration = this._currentGeneration;

    // Build and store the promise BEFORE any async work
    const promise = (async () => {
      try {
        const results = [];
        let page = 1;
        let lastPage = 1;
        const params = this._buildParams(query);

        do {
          if (page > 1) {
            params.set('page', String(page));
          }
          const queryString = params.toString();
          const url = `${basePath}?${queryString}`;

          const resp = await http.get(url);
          const data = resp.data ?? resp;
          const meta = resp.meta ?? {};

          if (Array.isArray(data)) {
            results.push(...data);
          }

          lastPage = meta.last_page ?? 1;
          page++;
        } while (page <= lastPage);

        return results;
      } finally {
        this._inflight.delete(key);
      }
    })();

    this._inflight.set(key, promise);

    // If the generation was superseded while fetching, still return the
    // results but don't cache them. Callers can use getActiveGeneration()
    // to detect staleness.
    return promise.then((results) => {
      // Only cache if the generation hasn't been superseded
      if (requestGeneration === this._currentGeneration) {
        this._cache.set(key, {
          query,
          data: results,
          generation: requestGeneration,
        });
      }
      return results;
    });
  }
}

export const locationService = new LocationService();
