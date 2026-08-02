import style from './mapa.component.css?raw';
import { http } from '../core/http.service.js';
import {
  STATUS_LABEL,
  PRIORITY_LABEL,
  timeAgo,
  escapeHtml,
} from '../utils/format.js';
import initMapView from '../shared/init-map-view.js';
import { mapaService } from './mapa.service.js';
import { auth } from '../auth/auth.service.js';

const STATUS_COLOR = {
  pending: 'secondary',
  in_progress: 'primary',
  resolved: 'success',
  pending_operator: 'warning',
};

const PRIORITY_COLOR = {
  high: 'danger',
  medium: 'warning',
  low: 'success',
};

// SRI hashes (sha384) for each unpkg asset. Pinned to leaflet.markercluster
// 1.5.3 — re-verify if the version is bumped. Computed as:
//   curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
// Failure semantics: a hash mismatch fires `script.onerror` (and the
// browser fails the CSS load), which the existing fallback path below
// already handles — fail-closed.
const MARKERCLUSTER_CSS = [
  {
    href: 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    integrity:
      'sha384-pmjIAcz2bAn0xukfxADbZIb3t8oRT9Sv0rvO+BR5Csr6Dhqq+nZs59P0pPKQJkEV',
  },
  {
    href: 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
    integrity:
      'sha384-wgw+aLYNQ7dlhK47ZPK7FRACiq7ROZwgFNg0m04avm4CaXS+Z9Y7nMu8yNjBKYC+',
  },
];

const MARKERCLUSTER_JS = {
  src: 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  integrity:
    'sha384-eXVCORTRlv4FUUgS/xmOyr66XBVraen8ATNLMESp92FKXLAMiKkerixTiBvXriZr',
};

export default {
  template: `
    <div class="mp-layout">
      <!-- Loading overlay -->
      <div id="mp-loading" class="mp-loading d-none">
        <div class="spinner-border text-light"></div>
        <span class="ms-2 text-light">Cargando mapa...</span>
      </div>

      <!-- Error banner -->
      <div
        id="mp-error"
        class="alert alert-danger mp-error d-none"
        role="alert"
      ></div>

      <!-- Floating filter panel (overlay on top of the map — collapses
           into a small FAB when not needed). The IDs match what the
           component JS looks up; only the layout changes. -->
      <aside id="mp-sidebar" class="mp-filters-panel">
        <header class="mp-filters-panel__header">
          <h5 class="mp-filters-panel__title">
            <i class="fas fa-filter me-2"></i>Filtros
          </h5>
          <button
            id="mp-toggle-filters"
            type="button"
            class="mp-filters-panel__close"
            aria-label="Cerrar filtros"
          >
            <i class="fas fa-times"></i>
          </button>
        </header>

        <div class="mp-filters-panel__body">
          <div class="mp-filter-group">
            <label for="mp-filter-status" class="form-label">Estado</label>
            <select id="mp-filter-status" class="form-select form-select-sm">
              <option value="">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="pending_operator">Pendiente operador</option>
              <option value="in_progress">En proceso</option>
              <option value="resolved">Resuelto</option>
            </select>
          </div>

          <div class="mp-filter-group">
            <label for="mp-filter-priority" class="form-label">Prioridad</label>
            <select id="mp-filter-priority" class="form-select form-select-sm">
              <option value="">Todas</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </div>

          <div class="mp-filter-group">
            <label for="mp-filter-category" class="form-label">Categoría</label>
            <select id="mp-filter-category" class="form-select form-select-sm">
              <option value="">Cargando...</option>
            </select>
          </div>

          <button
            id="mp-filter-reset"
            type="button"
            class="btn btn-sm btn-outline-secondary mt-3 w-100"
          >
            <i class="fas fa-undo me-1"></i>Limpiar filtros
          </button>
        </div>
      </aside>

      <!-- Floating "open filters" button — visible only when the panel
           is collapsed, hidden while it is open. -->
      <button
        id="mp-filters-open"
        type="button"
        class="mp-filters-fab"
        aria-label="Mostrar filtros"
      >
        <i class="fas fa-filter"></i>
      </button>

      <!-- Floating info card (bottom-right) — replaced the old sidebar
           meta block; sits over the map as a small chip. -->
      <div class="mp-info-chip">
        <div>
          <i class="fas fa-list me-1"></i
          ><span id="mp-incident-count">0 incidencias</span>
        </div>
        <div>
          <i class="fas fa-sync me-1"></i
          ><span id="mp-last-sync">Actualizando...</span>
        </div>
      </div>

      <!-- Main map canvas (now fills the entire layout — the filter panel
           and chip overlay it). -->
      <div
        id="mp-canvas"
        class="mp-canvas"
        role="region"
        aria-label="Mapa de incidencias"
      ></div>
    </div>
  `,
  style,

  async onInit() {
    document.body.classList.add('mp-view');

    // ── State ──
    this._filters = { status: '', priority: '', incident_category_id: '' };
    this._categories = [];
    this._lastSync = null;
    this._map = null;
    this._mapRemove = null;
    this._cluster = null;
    this._moveendTimer = null;
    this._pollingActive = false;

    // C6 (onInit/onDestroy race): set BEFORE the first await so that a
    // synchronous onDestroy call (e.g. user opens the map then navigates
    // away in the same tick) is correctly observed. Every async step
    // below checks this flag immediately after its await.
    this._aborted = false;
    // C5 (stale _refresh race): monotonic counter incremented on every
    // refresh entry. A late response from an older refresh check the
    // counter on return and drops itself instead of clobbering fresh
    // markers.
    this._refreshToken = 0;
    this._pollTimer = null;

    // ── Map ──
    // Ecuador-wide default (was hardcoded to Manta at street-level zoom 13
    // — useless for a national incident map, showed "0 incidencias" on
    // open until the user manually zoomed out). Center/zoom chosen to fit
    // continental Ecuador (mainland) in one view; the user's own pan/zoom
    // takes over from here via the moveend → _refresh() wiring below.
    const { map, remove } = await initMapView({
      container: 'mp-canvas',
      center: { lat: -1.5, lng: -78.5 },
      zoom: 6,
      liveInputs: false,
    });
    if (this._aborted) return;
    if (!map) return;
    this._map = map;
    this._mapRemove = remove;

    // C3 (cache cross-user): bind the service's cache namespace to the
    // current user so a stale response from a previous session can't be
    // served to a different logged-in user even before the explicit
    // logout-time invalidate runs.
    try {
      const me = await auth.me();
      mapaService.setUserId(me?.id ?? null);
    } catch {
      mapaService.setUserId(null);
    }
    if (this._aborted) return;

    // ── Categories (for filter dropdown) ──
    try {
      const resp = await http.get('/map/filters');
      const body = resp.data ?? resp;
      const cats = body?.categories ?? [];
      this._categories = Array.isArray(cats) ? cats : [];
    } catch {
      this._categories = [];
    }
    if (this._aborted) return;
    this._renderCategoryOptions();

    // ── Cluster group (loaded from CDN, idempotent) ──
    try {
      await this._loadMarkerCluster();
      if (this._aborted) return;
      this._cluster = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 60,
      });
      this._map.addLayer(this._cluster);
    } catch (err) {
      // markercluster is non-essential — log and fall back to plain markers.
      console.warn('[mapa] markercluster unavailable, falling back', err);
      this._cluster = null;
    }

    // ── Initial fetch ──
    this._showLoading(true);
    await this._refresh();
    this._showLoading(false);
    if (this._aborted) return;

    // ── Pan/zoom → debounced refetch ──
    this._map.on('moveend', () => {
      if (this._aborted) return;
      if (this._moveendTimer) clearTimeout(this._moveendTimer);
      this._moveendTimer = setTimeout(() => {
        if (!this._aborted) this._refresh();
      }, 400);
    });

    // ── Polling (15s) ──
    // C6: the interval is registered ONLY after every preceding await
    // resolved and we are still mounted. If onDestroy ran during init
    // we bail above and never reach this line — so the polling loop is
    // never started for an already-unmounted component.
    this._pollingActive = true;
    this._pollTimer = setInterval(() => {
      if (this._aborted || !this._pollingActive) return;
      this._refresh({ silent: true }).catch((err) =>
        console.warn('[mapa] polling fetch failed', err),
      );
    }, 15_000);

    // ── Filter listeners ──
    this._wireFilter('mp-filter-status', 'status');
    this._wireFilter('mp-filter-priority', 'priority');
    this._wireFilter('mp-filter-category', 'incident_category_id');

    document
      .getElementById('mp-filter-reset')
      ?.addEventListener('click', () => {
        this._filters = { status: '', priority: '', incident_category_id: '' };
        document.getElementById('mp-filter-status').value = '';
        document.getElementById('mp-filter-priority').value = '';
        document.getElementById('mp-filter-category').value = '';
        mapaService.invalidate();
        this._refresh();
      });

    // ── Filter panel toggle ──
    // Panel and FAB are mutually exclusive; state is driven by a body
    // class so CSS controls visibility in one place. Listeners are
    // stored so onDestroy can detach them (avoid piling up handlers
    // across remounts of this same view component).
    const setPanelOpen = (open) => {
      document.body.classList.toggle('mp-filters-open', open);
    };

    const onCloseClick = () => setPanelOpen(false);
    const onOpenClick = () => setPanelOpen(true);
    const onKeydown = (e) => {
      if (
        e.key === 'Escape' &&
        document.body.classList.contains('mp-filters-open')
      ) {
        setPanelOpen(false);
      }
    };
    this._escHandler = onKeydown;
    document
      .getElementById('mp-toggle-filters')
      ?.addEventListener('click', onCloseClick);
    document
      .getElementById('mp-filters-open')
      ?.addEventListener('click', onOpenClick);
    document.addEventListener('keydown', onKeydown);
    // Start with the panel open — users expect filters visible by
    // default on a dedicated /mapa route.
    setPanelOpen(true);
  },

  // ── Private ───────────────────────────────────────────────────────

  _wireFilter(elementId, key) {
    document.getElementById(elementId)?.addEventListener('change', (e) => {
      this._filters[key] = e.target.value;
      mapaService.invalidate();
      this._refresh();
    });
  },

  async _loadMarkerCluster() {
    MARKERCLUSTER_CSS.forEach(({ href, integrity }) => {
      if (!document.querySelector(`link[href*="${href.split('/').pop()}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.crossOrigin = 'anonymous';
        link.integrity = integrity;
        document.head.appendChild(link);
      }
    });

    if (window.L?.markerClusterGroup) return;

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = MARKERCLUSTER_JS.src;
      script.crossOrigin = 'anonymous';
      script.integrity = MARKERCLUSTER_JS.integrity;
      script.onload = resolve;
      script.onerror = () =>
        reject(new Error('Failed to load leaflet.markercluster'));
      document.head.appendChild(script);
    });
  },

  _renderCategoryOptions() {
    const select = document.getElementById('mp-filter-category');
    if (!select) return;
    select.innerHTML = '<option value="">Todas</option>';
    this._categories.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
  },

  _currentBBox() {
    if (!this._map) return null;
    const b = this._map.getBounds();
    if (!b.isValid()) return null;
    return [
      b.getWest().toFixed(6),
      b.getSouth().toFixed(6),
      b.getEast().toFixed(6),
      b.getNorth().toFixed(6),
    ].join(',');
  },

  _currentZoom() {
    return this._map?.getZoom() ?? null;
  },

  async _refresh({ silent = false } = {}) {
    // C5 (stale _refresh race): bump the token before each fetch. If a
    // newer _refresh() runs before this one resolves, myToken !==
    // this._refreshToken on return and we drop the response — instead
    // of clobbering the markers that a fresher refresh has already
    // rendered. Combined with the `silent` boolean on success/failure
    // paths, this prevents the "two panend events → slow + fast
    // responses → wrong order" bug.
    const myToken = ++this._refreshToken;
    try {
      const bbox = this._currentBBox();
      const zoom = this._currentZoom();
      const list = await mapaService.fetchIncidents({
        bbox,
        zoom,
        filters: this._filters,
        perPage: 500,
        force: silent,
      });
      // Drop stale or post-unmount responses.
      if (this._aborted || myToken !== this._refreshToken) return;
      this._renderMarkers(list);
      this._lastSync = new Date();
      this._updateSyncLabel();
      this._updateCountLabel(list.length);
    } catch (err) {
      if (this._aborted || myToken !== this._refreshToken) return;
      console.error('[mapa] refresh failed', err);
      if (!silent) this._showError(err.message || 'Error al cargar el mapa.');
    }
  },

  _renderMarkers(list) {
    if (this._cluster) {
      this._cluster.clearLayers();
    }
    list.forEach((inc) => {
      const coords = inc.geom?.coordinates;
      if (!coords) return;
      const [lng, lat] = coords;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      const marker = L.marker([lat, lng], { icon: this._buildIcon(inc) });
      marker.bindPopup(this._buildPopup(inc), {
        className: 'mp-marker-popup',
      });

      if (this._cluster) {
        this._cluster.addLayer(marker);
      } else {
        marker.addTo(this._map);
      }
    });
  },

  _buildIcon(inc) {
    const color = STATUS_COLOR[inc.status] ?? 'secondary';
    const priorityGlyph =
      inc.priority === 'high' ? '!' : inc.priority === 'medium' ? '·' : '';
    const html = `<div class="mp-marker mp-marker--${color}">${escapeHtml(priorityGlyph)}</div>`;
    return L.divIcon({
      className: 'mp-marker-wrapper',
      html,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  },

  _buildPopup(inc) {
    const statusLabel = STATUS_LABEL[inc.status] ?? inc.status ?? '—';
    const priorityLabel = PRIORITY_LABEL[inc.priority] ?? inc.priority ?? '—';
    const cat = inc.category?.name ?? '—';
    const ago = inc.created_at ? timeAgo(inc.created_at) : '';
    const detailUrl = `#/incidencias/${inc.id}`;
    return `
      <div class="mp-popup">
        <h6 class="mp-popup-title">${escapeHtml(inc.title ?? 'Sin título')}</h6>
        <div class="mp-popup-meta">
          <span class="badge bg-${STATUS_COLOR[inc.status] ?? 'secondary'}">${escapeHtml(statusLabel)}</span>
          <span class="badge bg-${PRIORITY_COLOR[inc.priority] ?? 'secondary'} ms-1">${escapeHtml(priorityLabel)}</span>
        </div>
        <div class="mp-popup-info small text-muted mt-1">
          <i class="fas fa-tag me-1"></i>${escapeHtml(cat)} ·
          <i class="fas fa-clock me-1"></i>${escapeHtml(ago)}
        </div>
        <a href="${detailUrl}" class="btn btn-sm btn-outline-primary mt-2">Ver detalle</a>
      </div>
    `;
  },

  _updateSyncLabel() {
    const el = document.getElementById('mp-last-sync');
    if (el && this._lastSync) {
      el.textContent = `Actualizado ${timeAgo(this._lastSync.toISOString())}`;
    }
  },

  _updateCountLabel(n) {
    const el = document.getElementById('mp-incident-count');
    if (el) {
      el.textContent = `${n} incidencia${n === 1 ? '' : 's'}`;
    }
  },

  _showLoading(on) {
    document.getElementById('mp-loading')?.classList.toggle('d-none', !on);
  },

  _showError(msg) {
    const el = document.getElementById('mp-error');
    if (el) {
      el.textContent = msg;
      el.classList.remove('d-none');
    }
  },

  onDestroy() {
    // C6: set the abort flag FIRST so any await currently suspended in
    // onInit / _refresh / _loadMarkerCluster bails on its next guard
    // check instead of clobbering state on a torn-down component.
    this._aborted = true;
    this._pollingActive = false;
    if (this._pollTimer) clearInterval(this._pollTimer);
    if (this._moveendTimer) clearTimeout(this._moveendTimer);
    if (this._cluster) this._cluster.clearLayers();
    if (this._mapRemove) this._mapRemove();
    // C3: drop the cache namespace so a future mount of this same
    // component (e.g. user navigates away then back) starts clean.
    mapaService.setUserId(null);
    document.body.classList.remove('mp-view');
    document.body.classList.remove('mp-filters-open');
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  },
};
