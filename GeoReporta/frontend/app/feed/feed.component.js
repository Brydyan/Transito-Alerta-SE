import template from './feed.component.html?raw';
import style from './feed.component.css?raw';
import {
  escapeHtml,
  timeAgo,
  STATUS_LABEL,
  PRIORITY_LABEL,
} from '../utils/format.js';
import {
  getUserDisplayName,
  resolveAvatarSrc,
  renderAvatarImg,
} from '../utils/avatar.js';
import { http } from '../core/http.service.js';
import { router } from '../core/router.js';
import { auth } from '../auth/auth.service.js';
import loadLeaflet from '../shared/leaflet.js';

const POR_PAGINA = 10;

// ── Card renderer ──────────────────────────────────────────

function renderCard(inc) {
  const catName = inc.category?.name ?? 'Categoría';
  const locName = inc.location?.name ?? '';
  const statusLabel = STATUS_LABEL[inc.status] ?? inc.status;
  const userName = getUserDisplayName(inc.user);
  const tiempo = timeAgo(inc.created_at);
  // profile_image_path is the canonical photo field; the legacy `avatar`
  // object is kept as a fallback for older payloads.
  const avatarSrc = resolveAvatarSrc(
    inc.user?.profile_image_path ?? inc.user?.avatar,
  );
  const avatarHtml = `<img class="ig-avatar-img" src="${avatarSrc}" alt="${escapeHtml(userName)}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;" />`;

  const priorityLabel = PRIORITY_LABEL[inc.priority] ?? inc.priority ?? 'Baja';
  const priorityClass = inc.priority ?? 'low';

  const descParts = [];
  if (inc.description) {
    descParts.push(inc.description);
  }
  if (inc.priority) {
    descParts.push(
      `Prioridad: ${inc.priority === 'high' ? 'Alta' : inc.priority === 'medium' ? 'Media' : 'Baja'}`,
    );
  }
  const orgs = inc.category?.organizations;
  const orgName =
    Array.isArray(orgs) && orgs.length > 0
      ? orgs
          .map((o) => o.name)
          .filter(Boolean)
          .join(', ')
      : null;
  if (orgName) {
    descParts.push(`Organización: ${orgName}`);
  }
  const descText = descParts.join(' · ');

  // Has resolution banner?
  let resolutionHtml = '';
  if (inc.status === 'resolved') {
    resolutionHtml = `
      <div class="feed-resolution-banner" style="background:#d8f6e7;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <i class="fa-solid fa-circle-check" style="color:#16a96b;font-size:16px"></i>
        <div style="font-size:12.5px;color:#1a7a4a;font-weight:600">
          Resuelta
        </div>
      </div>
    `;
  }

  // Tags/Hashtags
  const tagsHtml = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <span style="font-size:12px;color:#6a5cf3;background:#f0edff;padding:4px 11px;border-radius:10px;font-weight:600"># ${escapeHtml(catName)}</span>
      ${locName ? `<span style="font-size:12px;color:#6a5cf3;background:#f0edff;padding:4px 11px;border-radius:10px;font-weight:600"># ${escapeHtml(locName.split(',')[0])}</span>` : ''}
    </div>
  `;

  // Extract geometry coords for minimap (real or inline)
  const geomCoords =
    inc.geom?.type === 'Point' && Array.isArray(inc.geom?.coordinates)
      ? { lng: inc.geom.coordinates[0], lat: inc.geom.coordinates[1] }
      : null;

  let coordsHtml = '';
  if (geomCoords) {
    coordsHtml = `
      <div class="position-absolute bottom-0 start-0 m-2 bg-white bg-opacity-90 rounded-2 px-2 py-1 d-flex align-items-center gap-1" style="font-size:11px;color:#6b7180;backdrop-filter:blur(4px)">
        <i class="fa-solid fa-location-crosshairs" style="color:#5a6ff0;font-size:10px"></i>
        ${geomCoords.lat.toFixed(4)}, ${geomCoords.lng.toFixed(4)}
      </div>
    `;
  }

  let mediaHtml = '';
  if (inc.thumbnail_url) {
    mediaHtml = `
      <div class="feed-card-preview rounded-3 overflow-hidden position-relative mx-3 mb-3" style="height:180px">
        <img src="${inc.thumbnail_url}" class="w-100 h-100" style="object-fit:cover" />
        ${coordsHtml}
      </div>
    `;
  } else if (geomCoords) {
    // Map is opt-in (issue #225): never render the Leaflet map by default.
    // The user clicks the toggle to lazy-load Leaflet + tiles for that
    // specific card; clicking again disposes the map. The coords label is
    // always visible so the user has the geographic context for free.
    mediaHtml = `
      <div class="feed-map-section mx-3 mb-3">
        <div class="feed-map-coords d-flex align-items-center gap-2 mb-2">
          <i class="fa-solid fa-location-crosshairs" style="color:#5a6ff0;font-size:11px" aria-hidden="true"></i>
          <span class="text-muted" style="font-size:12px;font-weight:500">
            ${geomCoords.lat.toFixed(4)}, ${geomCoords.lng.toFixed(4)}
          </span>
        </div>
        <button
          type="button"
          class="btn btn-outline-primary btn-sm rounded-pill feed-map-toggle"
          data-inc-id="${inc.id}"
          aria-expanded="false"
          aria-controls="feed-mm-${inc.id}"
        >
          <i class="fa-solid fa-map-location-dot me-1" aria-hidden="true"></i>
          <span class="feed-map-toggle__label">Ver mapa</span>
        </button>
        <div
          id="feed-mm-${inc.id}"
          class="feed-minimap rounded-3 overflow-hidden d-none mt-2"
          data-inc-id="${inc.id}"
          data-lat="${geomCoords.lat}"
          data-lng="${geomCoords.lng}"
          style="height:180px;background:#e8ecf1"
        ></div>
      </div>
    `;
  }

  const commentCount = inc.comments_count ?? 0;

  // Status badge — soft-fill chip
  const statusBadgeClass = `feed-status-chip feed-status-${inc.status || 'default'}`;

  return `
    <div class="card feed-card feed-priority-${priorityClass} mb-3" data-route="/feed/${inc.id}" tabindex="0" role="link" aria-label="Ver detalle de ${escapeHtml(inc.title || 'Sin título')}" style="cursor:pointer;background-color:#ffffff!important">
      <div class="card-header bg-transparent d-flex align-items-center gap-3 py-3 px-3">
        ${avatarHtml}
        <div class="flex-grow-1 min-width-0">
          <div class="fw-bold" style="font-size:14px;color:#23283b">${escapeHtml(userName)}</div>
          <div class="text-muted d-flex align-items-center gap-1" style="font-size:12px">
            <i class="fa-solid fa-location-dot" style="color:#a06bf5;font-size:10px"></i>
            ${escapeHtml(locName) || 'Ubicación no especificada'} &nbsp;·&nbsp; ${tiempo}
          </div>
        </div>
        <span class="badge ${statusBadgeClass}">${statusLabel}</span>
        <span class="badge feed-priority-badge feed-priority-${priorityClass}">● ${priorityLabel}</span>
      </div>

      <div class="card-body pt-0 pb-2 px-3">
        <div class="fw-bold mb-1" style="font-size:15px;color:#23283b">
          ${escapeHtml(inc.title || 'Sin título')}
          <span class="fw-normal text-muted" style="font-size:13px">INC-${String(inc.id).padStart(4, '0')}</span>
        </div>
        <div class="feed-card-desc text-secondary mb-2" style="font-size:13.5px;line-height:1.55">
          ${escapeHtml(descText)}
        </div>
        ${resolutionHtml}
        ${tagsHtml}
      </div>

      ${mediaHtml}

      <div class="card-footer bg-transparent d-flex align-items-center gap-2 px-3 py-2 feed-card-footer">
        <div class="d-flex gap-1 flex-grow-1 flex-wrap">
          <button class="btn btn-light btn-sm rounded-pill" style="font-size:13px" onclick="event.stopPropagation()">
            <i class="fa-regular fa-comment me-1"></i>
            ${commentCount}
          </button>
          <button class="btn btn-light btn-sm rounded-pill" style="font-size:13px" onclick="event.stopPropagation()">
            <i class="fa-regular fa-eye me-1"></i>Seguir
          </button>
          <button class="btn btn-light btn-sm rounded-pill" style="font-size:13px" onclick="event.stopPropagation()">
            <i class="fa-solid fa-triangle-exclamation me-1"></i>Yo también reporto
          </button>
        </div>
        <button class="feed-action-btn btn btn-primary btn-sm rounded-pill" data-route="/feed/${inc.id}" title="Ver detalle" style="white-space:nowrap" onclick="event.stopPropagation()">
          <i class="fa-solid fa-arrow-up-right-from-square me-1"></i>Ver detalle
        </button>
      </div>
    </div>
  `;
}

// ── Mini-map (opt-in toggle) ───────────────────────────────
//
// Each card with a geom renders a coords label + a "Ver mapa" toggle. The
// Leaflet map is only constructed when the user clicks the toggle. Clicking
// again disposes the map. This avoids downloading Leaflet + tiles for every
// card in the feed (issue #225) — bandwidth-friendly by default.

async function toggleMiniMap(button) {
  const incId = button.dataset.incId;
  if (!incId) return;

  const container = document.getElementById(`feed-mm-${incId}`);
  if (!container) return;

  const labelEl = button.querySelector('.feed-map-toggle__label');
  const isActive = button.getAttribute('aria-expanded') === 'true';

  if (isActive) {
    // Collapse — dispose the map and hide the container.
    container.classList.add('d-none');
    button.setAttribute('aria-expanded', 'false');
    if (labelEl) labelEl.textContent = 'Ver mapa';
    if (container._leaflet_map) {
      container._leaflet_map.remove();
      delete container._leaflet_map;
    }
    return;
  }

  // Expand — show the container and lazy-init the map on first open.
  container.classList.remove('d-none');
  button.setAttribute('aria-expanded', 'true');
  if (labelEl) labelEl.textContent = 'Ocultar mapa';

  // Fast path — map already built. It was constructed while the container
  // was hidden (d-none), so re-measure now that it is visible again.
  if (container._leaflet_map) {
    container._leaflet_map.invalidateSize();
    return;
  }

  // Guard against a concurrent init while one is in flight: clicking the
  // toggle again during `await loadLeaflet()` must not start a second build,
  // and the resumed init must not build a map for a card that was collapsed
  // (or re-rendered/detached) in the meantime (TOCTOU race).
  if (container._map_loading) return;
  container._map_loading = true;

  const lat = parseFloat(container.dataset.lat);
  const lng = parseFloat(container.dataset.lng);
  if (isNaN(lat) || isNaN(lng)) return;

  try {
    await loadLeaflet();
  } catch {
    container._map_loading = false;
    return;
  }

  // Re-check the live expanded state after the async gap. If the user
  // collapsed the card while Leaflet was loading, do not build the map.
  if (
    button.getAttribute('aria-expanded') !== 'true' ||
    container.classList.contains('d-none') ||
    !container.isConnected
  ) {
    container._map_loading = false;
    return;
  }

  const map = L.map(container, {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    keyboard: false,
    attributionControl: false,
  }).setView([lat, lng], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  L.marker([lat, lng]).addTo(map);

  container._leaflet_map = map;
  container._map_loading = false;
}

function disposeMiniMaps() {
  // Tear down any active maps before the card markup is replaced. Maps are
  // toggled individually now, but a search/filter change still re-renders
  // the whole list, so we have to clean up dangling Leaflet instances.
  document.querySelectorAll('.feed-minimap').forEach((el) => {
    if (el._leaflet_map) {
      el._leaflet_map.remove();
      delete el._leaflet_map;
    }
  });
}

// ── DOM ids (single responsive template) ───────────────────

const LIST = 'feed-list';
const FILTERS = 'feed-filters';
const SKELETON = 'feed-cargando';
const VACIO = 'feed-vacio';
const TRIGGER = 'feed-scroll-trigger';
const LOADING = 'feed-loading';
const SCROLL_REGION = 'feed-scroll-region';
const CHIP_SELECTOR = '.feed-chip';

// ── Component ──────────────────────────────────────────────

export default {
  template,
  style,

  async onInit() {
    let paginaActual = 1;
    let totalPaginas = 1;
    let filtroStatus = '';
    let cargando = false;
    let todasLasIncidencias = [];
    let searchQuery = '';
    let observer = null;
    // Category tree for the TIPO filter panel. Maps a category id to its
    // own id plus every descendant id, so checking a parent category also
    // matches incidents filed under any of its subcategories.
    const categoryDescendants = new Map();

    document.body.classList.add('feed-view');

    // ── Fetch stats for today ──
    async function fetchStats() {
      try {
        // Gate stats fetch: only attempt if user has dashboard.view permission.
        // Guests and unauthorized users will get 403 — don't spam console.
        const today = new Date().toLocaleDateString('en-CA');
        const params = new URLSearchParams({
          inicio: today,
          fin: today,
        });
        const statsData = await http.get(
          `/incidents/stats?${params.toString()}`,
        );

        // Parse stats and update UI
        // "Nuevas hoy" = total incidents created today (not just pending)
        // "Resueltas hoy" = incidents resolved today (by resolved_at, not created_at)
        const newCount = statsData.total ?? 0;
        const resolvedCount = statsData.by_status?.resolved ?? 0;
        const avgTime = statsData.average_resolution_time?.formatted ?? '0';

        // Update main stats cards
        const statNewEl = document.getElementById('stat-new');
        const statResolvedEl = document.getElementById('stat-resolved');
        const statAvgEl = document.getElementById('stat-avg');

        if (statNewEl) statNewEl.textContent = newCount;
        if (statResolvedEl) statResolvedEl.textContent = resolvedCount;
        if (statAvgEl) statAvgEl.textContent = avgTime;

        // Update right panel stats (desktop)
        const rpStatNewEl = document.getElementById('rp-stat-new');
        const rpStatResolvedEl = document.getElementById('rp-stat-resolved');
        const rpStatAvgEl = document.getElementById('rp-stat-avg');

        if (rpStatNewEl) rpStatNewEl.textContent = newCount;
        if (rpStatResolvedEl) rpStatResolvedEl.textContent = resolvedCount;
        if (rpStatAvgEl) rpStatAvgEl.textContent = avgTime;
      } catch (error) {
        // Ignore 403 Forbidden (unauthorized users and guests have no dashboard.view)
        if (error.response?.status === 403) {
          return;
        }
        console.error('[feed] Error fetching stats:', error);
      }
    }

    // ── Category filters (TIPO panel) ────────────────────────
    // The checkboxes are rendered from the real category tree
    // (GET /incident-categories/tree) instead of hardcoded labels, and
    // filtering matches incidents by exact category id, so renamed or
    // nested categories keep working.
    function collectCategoryIds(node, acc) {
      acc.push(node.id);
      (node.children ?? []).forEach((child) => collectCategoryIds(child, acc));
      return acc;
    }

    // Accordion category tree. Parents render as a row (checkbox + name +
    // chevron toggle); subcategories render inside a collapsible container
    // hidden by default, so a deep tree stays compact until the user opens
    // a branch. The parent checkbox still implies its descendants for
    // filtering (categoryDescendants); the chevron only toggles visibility.
    function appendCategoryFilter(node, depth, container) {
      if (node.id == null) return;
      categoryDescendants.set(node.id, collectCategoryIds(node, []));

      const children = node.children ?? [];
      const hasChildren = children.length > 0;

      const row = document.createElement('div');
      row.className = 'rp-cat-row';

      const label = document.createElement('label');
      label.className = 'rp-checkbox-label form-check-label';
      label.htmlFor = `rp-cat-${node.id}`;

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'rp-checkbox-box form-check-input';
      box.id = `rp-cat-${node.id}`;
      box.dataset.categoryId = String(node.id);

      const name = document.createElement('span');
      name.textContent = node.name ?? '';
      if (depth > 0) {
        // Visually indent subcategories under their parent. The indent +
        // chevron affordance replaces the old "— " text prefix.
        label.style.paddingLeft = `${depth * 20}px`;
      }

      label.append(box, name);
      row.append(label);

      if (hasChildren) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'rp-cat-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', `rp-cat-children-${node.id}`);
        toggle.setAttribute(
          'aria-label',
          `Mostrar subcategorías de ${node.name ?? ''}`,
        );
        toggle.innerHTML =
          '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
        row.append(toggle);

        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'rp-cat-children';
        childrenContainer.id = `rp-cat-children-${node.id}`;
        childrenContainer.hidden = true;
        children.forEach((child) =>
          appendCategoryFilter(child, depth + 1, childrenContainer),
        );
        container.append(row, childrenContainer);
      } else {
        container.append(row);
      }
    }

    async function loadCategoryFilters() {
      const container = document.getElementById('rp-category-filters');
      if (!container) return;
      try {
        const resp = await http.get('/incident-categories/tree');
        const nodes = Array.isArray(resp)
          ? resp
          : Array.isArray(resp?.data)
            ? resp.data
            : [];
        nodes.forEach((node) => appendCategoryFilter(node, 0, container));
      } catch (error) {
        // Degrade gracefully: without the tree there are no checkboxes, so
        // the category filter stays disabled and the feed unfiltered.
        console.warn('[feed] Failed to load category filters:', error);
      }
    }

    // Composer setup
    const composerBar = document.getElementById('composer-bar');
    if (composerBar) {
      if (auth.isAuthenticated()) {
        composerBar.classList.remove('d-none');
        const currentUser = auth.getUser();
        const composerAvatar = document.getElementById('composer-avatar');
        if (composerAvatar && currentUser) {
          composerAvatar.innerHTML = renderAvatarImg(currentUser, 40);
        }
      } else {
        composerBar.classList.add('d-none');
      }
      composerBar.addEventListener('click', () => {
        router.navigate('/feed/crear');
      });
    }

    const feedList = document.getElementById(LIST);
    const feedFilters = document.getElementById(FILTERS);
    if (!feedList) return;

    // Event delegation: any click on an element with [data-route]
    // (cards, "Ver detalle" buttons) navigates via the router. The
    // onclick="window.location.hash=..." inline handlers were removed
    // in favor of this single delegated listener — it works for any
    // card appended later by infinite scroll without re-binding.
    // Keyboard parity: Enter / Space on the card root (or any non-button
    // descendant) triggers the same navigation. Internal buttons still
    // fire their own native handlers.
    //
    // Map opt-in toggle (issue #225) is checked FIRST so a click on the
    // toggle opens/closes the map without triggering the card's
    // [data-route] navigation. The toggle button relies on this
    // delegation working the same way as the comment/follow pill
    // buttons (which use inline event.stopPropagation() for the same
    // reason).
    function navigateFromTarget(target, originalEvent) {
      if (!target) return;
      originalEvent.preventDefault();
      router.navigate(target.dataset.route);
    }

    feedList.addEventListener('click', (e) => {
      const toggle = e.target.closest('.feed-map-toggle');
      if (toggle) {
        toggleMiniMap(toggle);
        e.stopImmediatePropagation();
      }
    });

    feedList.addEventListener('click', (e) => {
      const target = e.target.closest('[data-route]');
      if (!target) return;
      navigateFromTarget(target, e);
    });

    feedList.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target.closest('[data-route]');
      if (!target) return;
      if (e.target.closest('button')) return;
      navigateFromTarget(target, e);
    });

    // ── Fetch ───────────────────────────────────────────────

    async function fetchIncidencias(pagina, append = false) {
      if (cargando) return;
      cargando = true;

      const listEl = document.getElementById(LIST);
      const skeleton = document.getElementById(SKELETON);
      const vacio = document.getElementById(VACIO);
      const trigger = document.getElementById(TRIGGER);
      const loadingEl = document.getElementById(LOADING);

      if (!append) {
        skeleton.classList.remove('d-none');
        listEl.innerHTML = '';
        vacio.classList.add('d-none');
        trigger.classList.remove('done');
        todasLasIncidencias = [];
      } else {
        // Infinite-scroll fetch: only here do we show the spinner. The
        // initial load uses the skeleton loader instead, so the user
        // never sees a spinner spin idly at the bottom of the list.
        loadingEl.classList.remove('d-none');
      }

      const params = new URLSearchParams({
        page: pagina,
        per_page: POR_PAGINA,
      });
      if (filtroStatus) params.set('status', filtroStatus);

      try {
        const json = await http.get(`/incidents/feed?${params.toString()}`);

        const datos = json.data ?? [];
        const meta = json.meta ?? {};
        paginaActual = meta.current_page ?? pagina;
        totalPaginas = meta.last_page ?? 1;
        const hasMore = paginaActual < totalPaginas;

        skeleton.classList.add('d-none');
        loadingEl.classList.add('d-none');

        if (!append) todasLasIncidencias = datos;
        else todasLasIncidencias = [...todasLasIncidencias, ...datos];

        renderList();
        trigger.classList.toggle('done', !hasMore);
      } catch {
        skeleton.classList.add('d-none');
        loadingEl.classList.add('d-none');
        vacio.classList.remove('d-none');
        vacio.querySelector('p').textContent =
          'Error al cargar. Intente de nuevo.';
        document.getElementById(TRIGGER).classList.add('done');
      } finally {
        cargando = false;
      }
    }

    // ── Render (applies search + category filters on cached data) ──

    function renderList() {
      const listEl = document.getElementById(LIST);
      const vacio = document.getElementById(VACIO);
      if (!listEl || !vacio) return;

      const q = searchQuery.trim().toLowerCase();
      const checkedIds = Array.from(
        document.querySelectorAll('.rp-checkbox-box[data-category-id]'),
      )
        .filter((box) => box.classList.contains('checked') || box.checked)
        .map((box) => Number(box.dataset.categoryId));

      let filtered = todasLasIncidencias;

      if (q) {
        filtered = filtered.filter((inc) => {
          const title = (inc.title || '').toLowerCase();
          const desc = (inc.description || '').toLowerCase();
          return title.includes(q) || desc.includes(q);
        });
      }

      if (checkedIds.length > 0) {
        // A checked category matches its own incidents and, when it is a
        // parent, every incident filed under one of its subcategories.
        const matchIds = new Set();
        checkedIds.forEach((id) => {
          const ids = categoryDescendants.get(id);
          if (ids) ids.forEach((did) => matchIds.add(did));
        });
        filtered = filtered.filter(
          (inc) => inc.category?.id != null && matchIds.has(inc.category.id),
        );
      }

      disposeMiniMaps();
      if (filtered.length === 0) {
        listEl.innerHTML = '';
        vacio.classList.remove('d-none');
        const vacioP = vacio.querySelector('p');
        if (vacioP) {
          vacioP.textContent = q
            ? `No se encontraron incidencias que coincidan con "${searchQuery.trim()}".`
            : 'No hay incidencias publicadas.';
        }
      } else {
        vacio.classList.add('d-none');
        listEl.innerHTML = filtered.map(renderCard).join('');
        // Maps are now opt-in per card (issue #225); renderList no longer
        // preloads Leaflet or any tiles. The toggle handler attached in
        // onInit wires up the per-card lazy-load on click.
      }
    }

    // ── Infinite scroll ─────────────────────────────────────

    function setupInfiniteScroll() {
      if (observer) observer.disconnect();

      const trigger = document.getElementById(TRIGGER);
      if (!trigger || trigger.classList.contains('done')) return;

      // The feed-scroll-region is the only scrollable area when the
      // feed is mounted (we force `body.feed-view { overflow: hidden }`
      // in the component CSS to disable the app-shell-main scroll).
      // Scope the IntersectionObserver to it so the infinite-scroll
      // trigger fires when the trigger reaches its bottom. Guard
      // against a missing root so we don't silently fall back to the
      // viewport (REL-1 fix).
      const root = document.getElementById(SCROLL_REGION);
      if (!root) {
        console.warn(
          '[feed] #feed-scroll-region not found, skipping infinite scroll',
        );
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          if (
            entries[0].isIntersecting &&
            !cargando &&
            paginaActual < totalPaginas
          ) {
            fetchIncidencias(paginaActual + 1, true);
          }
        },
        { root, rootMargin: '0px 0px 200px 0px' },
      );

      observer.observe(sentinel);
    }

    // ── Filter chips (unified: main + aside use same selector) ──
    function applyStatusFilter(chip) {
      document
        .querySelectorAll(`${CHIP_SELECTOR}, .rp-filter-chip`)
        .forEach((c) => {
          c.classList.toggle(
            'active',
            c.dataset.status === chip.dataset.status,
          );
        });

      filtroStatus = chip.dataset.status;
      paginaActual = 1;
      if (observer) observer.disconnect();
      return fetchIncidencias(1, false).then(() => setupInfiniteScroll());
    }

    if (feedFilters) {
      feedFilters.addEventListener('click', (e) => {
        const chip = e.target.closest(CHIP_SELECTOR);
        if (chip) applyStatusFilter(chip);
      });
    }

    const rpStatusFilters = document.getElementById('rp-status-filters');
    if (rpStatusFilters) {
      rpStatusFilters.addEventListener('click', (e) => {
        const chip = e.target.closest('.rp-filter-chip');
        if (chip) applyStatusFilter(chip);
      });
    }

    // ── Right Sidebar Category Checkbox filters ──
    // Checkboxes are rendered dynamically from the category tree and the
    // input lives inside its label so the delegated handler can reach it.
    // Clicking the label stops the browser's implicit activation (which
    // would forward a synthetic click at the input and double-toggle) and
    // flips the native input + the visual .checked class ourselves.
    const rpCategoryFilters = document.getElementById('rp-category-filters');

    // Accordion helpers: expand/collapse a parent branch. Only one branch
    // is open at a time — opening one collapses any other open one.
    function setCategoryExpanded(toggle, expanded) {
      toggle.setAttribute('aria-expanded', String(expanded));
      const target = document.getElementById(
        toggle.getAttribute('aria-controls'),
      );
      if (target) target.hidden = !expanded;
      const icon = toggle.querySelector('.fa-solid');
      if (icon) {
        icon.classList.toggle('fa-chevron-down', expanded);
        icon.classList.toggle('fa-chevron-right', !expanded);
      }
    }

    function expandCategory(toggle) {
      rpCategoryFilters
        .querySelectorAll('.rp-cat-toggle[aria-expanded="true"]')
        .forEach((other) => setCategoryExpanded(other, false));
      setCategoryExpanded(toggle, true);
    }

    // Set a checkbox to a concrete checked state, keeping the native input
    // and the visual .checked class in sync. Used by the parent/subcategory
    // sync below, where a box may be cleared without a click on itself.
    function setBoxChecked(box, checked) {
      box.checked = checked;
      box.classList.toggle('checked', checked);
      const label = box.closest('.rp-checkbox-label');
      if (label) label.style.color = checked ? '#5b6172' : '#a3a8b8';
    }

    if (rpCategoryFilters) {
      rpCategoryFilters.addEventListener('click', (e) => {
        // Chevron toggle: expand/collapse a parent branch without touching
        // its checkbox. It is a real <button>, so Enter/Space work natively.
        const toggle = e.target.closest('.rp-cat-toggle');
        if (toggle) {
          if (toggle.getAttribute('aria-expanded') === 'true') {
            setCategoryExpanded(toggle, false);
          } else {
            expandCategory(toggle);
          }
          return;
        }

        const label = e.target.closest('.rp-checkbox-label');
        if (!label) return;

        const box = label.querySelector('.rp-checkbox-box');
        if (!box) return;

        const clickingBox = e.target === box;
        if (!clickingBox) e.preventDefault();

        // For a direct click on the input the native checked state is
        // already toggled when the handler runs; for a label click we
        // flip it ourselves after canceling the implicit activation.
        const checked = clickingBox ? box.checked : !box.checked;
        setBoxChecked(box, checked);

        // Checking a parent reveals its subcategories (feedback that the
        // selection implies them). Unchecking does not collapse the branch.
        if (checked) {
          const toggleBtn = label
            .closest('.rp-cat-row')
            ?.querySelector('.rp-cat-toggle');
          if (toggleBtn && toggleBtn.getAttribute('aria-expanded') !== 'true') {
            expandCategory(toggleBtn);
          }
        }

        // Parent/subcategory sync: a specific selection wins over its
        // umbrella. Checking a subcategory clears its parent (so the filter
        // narrows to that exact subcategory), and checking a parent clears
        // its subcategories (the parent already implies them). This keeps
        // every check visibly effective instead of being masked by an
        // ancestor that implies it.
        const parentContainer = box.closest('.rp-cat-children');
        if (checked && parentContainer) {
          // Subcategory → clear its parent row.
          const parentId = parentContainer.id.replace('rp-cat-children-', '');
          const parentBox = document.getElementById(`rp-cat-${parentId}`);
          if (parentBox?.checked) setBoxChecked(parentBox, false);
        } else if (checked) {
          // Parent → clear every checked subcategory inside it.
          const controls = label
            .closest('.rp-cat-row')
            ?.querySelector('.rp-cat-toggle')
            ?.getAttribute('aria-controls');
          const childrenContainer = controls
            ? document.getElementById(controls)
            : null;
          childrenContainer
            ?.querySelectorAll('.rp-checkbox-box')
            .forEach((sub) => {
              if (sub.checked) setBoxChecked(sub, false);
            });
        }

        // Re-render with combined search + category filters
        renderList();
      });
    }

    // ── Search input (mobile main column + desktop right panel) ──
    const searchInputs = [
      document.getElementById('feed-search-input'),
      document.getElementById('rp-search-input'),
    ].filter(Boolean);

    function applySearch(value) {
      searchQuery = value;
      // Sync the other visible input to the same value
      searchInputs.forEach((input) => {
        if (input.value !== value) input.value = value;
      });
      renderList();
    }

    searchInputs.forEach((input) => {
      input.addEventListener('input', (e) => {
        applySearch(e.target.value);
      });
    });

    // ── Filter feed collapsible toggle (main column, mobile) ──
    const feedFilterToggle = document.getElementById('feed-filter-toggle');
    const feedFilterContent = document.getElementById('feed-filter-content');
    if (feedFilterToggle && feedFilterContent) {
      function toggleFeedFilterPanel() {
        const isExpanded =
          feedFilterToggle.getAttribute('aria-expanded') === 'true';
        feedFilterToggle.setAttribute('aria-expanded', !isExpanded);
        feedFilterContent.classList.toggle('feed-filter-collapsed');
      }

      feedFilterToggle.addEventListener('click', toggleFeedFilterPanel);
      feedFilterToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFeedFilterPanel();
        }
      });
    }

    // ── Right panel collapsible toggle (desktop ≥992px) ──
    const rpFilterToggle = document.getElementById('rp-filter-toggle');
    if (rpFilterToggle) {
      function toggleFilterPanel() {
        rpFilterToggle.classList.toggle('collapsed');
        rpFilterToggle.setAttribute(
          'aria-expanded',
          rpFilterToggle.classList.contains('collapsed') ? 'false' : 'true',
        );
      }

      rpFilterToggle.addEventListener('click', toggleFilterPanel);
      rpFilterToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFilterPanel();
        }
      });
    }

    // ── First load ──
    await Promise.all([fetchIncidencias(1, false), loadCategoryFilters()]);
    setupInfiniteScroll();
    await fetchStats();
  },

  onDestroy() {
    disposeMiniMaps();
    document.body.classList.remove('feed-view');
  },
};
