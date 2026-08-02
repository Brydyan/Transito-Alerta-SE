import { http } from '../core/http.service.js';

/**
 * Service for fetching incidents for the map view — shared by every role.
 *
 * Hits `/incidents/feed`, which now branches server-side by role (staff
 * roles get a live, org-scoped Postgres read with bbox support; `usuario`
 * gets the broader Redis-cached citizen feed, no bbox). One service, one
 * component (`mapa.component.js`) for everyone — there is no separate
 * "citizen" map anymore.
 *
 * Caches responses in-memory by (bbox, zoom, filters) for 30s. The component
 * layer bypasses the cache on its own polling cadence (15s) by passing
 * `force: true` so the service does not need to know about intervals.
 */
const CACHE_TTL_MS = 30_000;

class MapaService {
  constructor() {
    this._cache = new Map();
    // Module-level user scope. The mapa component calls setUserId() on
    // init with the result of `auth.me()`. Until then cache keys fall
    // back to the literal `'anon'` — which, combined with the explicit
    // `invalidate()` call in `auth.service.js → logout()`, prevents one
    // user's cached incidents from leaking into another user's session.
    this._userId = 'anon';
  }

  /**
   * Bind the cache to a specific user. Idempotent and safe to call on
   * every map component init. Pass `null` to reset to the anonymous
   * scope (used during logout flows).
   */
  setUserId(id) {
    this._userId = id == null ? 'anon' : String(id);
  }

  buildCacheKey({ bbox, zoom, filters }) {
    const f = [
      filters?.status || '',
      filters?.priority || '',
      filters?.incident_category_id || '',
    ].join('|');
    return `${this._userId}|${bbox || 'all'}|${zoom || ''}|${f}`;
  }

  async fetchIncidents({
    bbox = null,
    zoom = null,
    filters = {},
    perPage = 500,
    force = false,
  } = {}) {
    const key = this.buildCacheKey({ bbox, zoom, filters });
    const now = Date.now();

    if (!force && this._cache.has(key)) {
      const entry = this._cache.get(key);
      if (now - entry.ts < CACHE_TTL_MS) {
        return entry.data;
      }
    }

    const params = new URLSearchParams();
    if (bbox) params.set('bbox', bbox);
    if (zoom) params.set('zoom', String(zoom));
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.incident_category_id) {
      params.set('incident_category_id', String(filters.incident_category_id));
    }
    params.set('per_page', String(perPage));

    const resp = await http.get(`/incidents/feed?${params.toString()}`);
    const data = resp.data ?? resp;
    const list = Array.isArray(data?.data) ? data.data : data;

    this._cache.set(key, { data: list, ts: now });
    return list;
  }

  invalidate() {
    this._cache.clear();
  }
}

export const mapaService = new MapaService();
