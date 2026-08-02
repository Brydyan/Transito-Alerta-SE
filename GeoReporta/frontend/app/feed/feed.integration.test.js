/**
 * Feed integration test — mock GET /incidents/feed, verify card rendering.
 *
 * Sets up the DOM as admin shell (desktop mode), loads the feed component,
 * and checks that incident cards are rendered with correct data.
 */
const layout = vi.hoisted(() => ({
  initPage: vi.fn(),
  initShell: vi.fn(),
}));

vi.mock('../utils/layout.js', () => layout);

// Control when the Leaflet loader resolves so we can exercise the TOCTOU
// race: the default (rejection) keeps the pre-existing tests behaving as
// before; the new race test overrides it with a deferred promise.
const leafletLoader = vi.hoisted(() => ({
  loadLeaflet: vi.fn(),
}));

vi.mock('../shared/leaflet.js', () => ({
  default: leafletLoader.loadLeaflet,
}));

import { auth } from '../auth/auth.service.js';

const FEED_TEMPLATE = `
<div id="feed" class="row">
  <div class="col-12 col-lg-8">
    <div class="composer-bar d-none card mb-3" id="composer-bar">
      <div class="card-body d-flex align-items-center gap-3">
        <div class="composer-avatar" id="composer-avatar">?</div>
        <div class="composer-input-wrap flex-grow-1">
          <span class="composer-placeholder">¿Qué incidencia deseas reportar hoy?</span>
        </div>
        <button class="composer-btn btn btn-primary">
          <i class="fa-solid fa-location-dot"></i> Reportar
        </button>
      </div>
    </div>
    <div id="stats-container" class="stats-cards mb-4">
      <div class="stats-card"><div class="stats-value" id="stat-new">14</div><div class="stats-label">Nuevas hoy</div></div>
      <div class="stats-card"><div class="stats-value" id="stat-resolved">8</div><div class="stats-label">Resueltas hoy</div></div>
      <div class="stats-card"><div class="stats-value" id="stat-avg">2.4d</div><div class="stats-label">Promedio resolución</div></div>
    </div>
    <div class="feed-search-input-wrap d-block d-lg-none mb-3">
      <div class="feed-search-input">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" id="feed-search-input" class="feed-search-input__field" placeholder="Buscar incidencia..." aria-label="Buscar incidencia" />
      </div>
    </div>
    <div class="feed-filter-section mb-4">
      <div class="feed-filter-toggle" id="feed-filter-toggle" role="button" tabindex="0" aria-expanded="false" aria-controls="feed-filter-content">
        <div class="fw-bold">Filtrar feed</div>
        <i class="fa-solid fa-chevron-down feed-filter-chevron"></i>
      </div>
      <div id="feed-filter-content" class="feed-filter-content feed-filter-collapsed">
        <div class="feed-filters d-flex flex-wrap gap-2 mt-3" id="feed-filters">
          <button class="feed-chip active btn btn-outline-primary btn-sm" data-status="">Todo</button>
          <button class="feed-chip btn btn-outline-primary btn-sm" data-status="pending">Pendientes</button>
          <button class="feed-chip btn btn-outline-primary btn-sm" data-status="in_progress">En proceso</button>
          <button class="feed-chip btn btn-outline-primary btn-sm" data-status="resolved">Resueltos</button>
        </div>
      </div>
    </div>
    <div id="feed-cargando" class="feed-skeleton-wrap d-none">
      <div class="feed-skeleton-card card">
        <div class="card-body">
          <div class="feed-skel-head d-flex align-items-center gap-2 mb-3">
            <div class="feed-skel-avatar"></div>
            <div class="feed-skel-line w-40"></div>
          </div>
          <div class="feed-skel-preview mb-3"></div>
          <div class="feed-skel-body">
            <div class="feed-skel-line w-60 mb-2"></div>
            <div class="feed-skel-line w-30"></div>
          </div>
        </div>
      </div>
    </div>
    <div id="feed-vacio" class="feed-empty d-none card text-center">
      <div class="card-body">
        <div class="feed-empty-icon">📭</div>
        <p>No hay incidencias publicadas.</p>
      </div>
    </div>
    <div id="feed-scroll-region" class="feed-scroll-region">
      <div id="feed-list" class="feed-cards row g-3"></div>
      <div id="feed-scroll-trigger" class="feed-scroll-trigger" aria-hidden="true"></div>
      <div id="feed-loading" class="feed-loading d-none">
        <div class="feed-spinner"></div>
      </div>
      <div class="feed-footer-message" role="status">
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        <span>Has visto todos los incidentes</span>
      </div>
    </div>
  </div>
  <aside class="col-12 col-lg-4 position-sticky top-0 d-none d-lg-block">
    <div class="rp-card card shadow-sm border-0 rounded-3 p-3 mb-3">
      <div class="rp-card-title card-title fw-bold mb-3">Filtrar feed</div>
      <div id="rp-filter-content" class="rp-filter-content">
        <div class="rp-card-section-label text-muted small fw-bold text-uppercase">
          TIPO
        </div>
        <div class="rp-category-filters" id="rp-category-filters"></div>
      </div>
    </div>
    <div class="rp-card card shadow-sm border-0 rounded-3 p-3 mb-3">
      <div class="rp-card-title card-title fw-bold mb-3">Estadísticas hoy</div>
      <div class="rp-stat row align-items-center mb-2">
        <div class="col">
          <div class="rp-stat-value fs-5 fw-bold" id="rp-stat-new">14</div>
          <div class="rp-stat-label small text-muted">Nuevas hoy</div>
        </div>
      </div>
      <div class="rp-stat row align-items-center mb-2">
        <div class="col">
          <div class="rp-stat-value fs-5 fw-bold" id="rp-stat-resolved">8</div>
          <div class="rp-stat-label small text-muted">Resueltas hoy</div>
        </div>
      </div>
      <div class="rp-stat row align-items-center">
        <div class="col">
          <div class="rp-stat-value fs-5 fw-bold" id="rp-stat-avg">2.4 d</div>
          <div class="rp-stat-label small text-muted">Promedio resolución</div>
        </div>
      </div>
    </div>
  </aside>
</div>
`;

const MOCK_INCIDENTS = [
  {
    id: 1,
    title: 'Bache en la Av. Principal',
    description:
      'Se reporta un bache grande en la avenida principal que ha causado daños a vehículos.',
    status: 'pending',
    priority: 'high',
    category: { id: 1, name: 'Infraestructura' },
    geom: { type: 'Point', coordinates: [-80.7286, -0.9537] },
    location_name: 'Av. Principal',
    created_at: new Date().toISOString(),
    user: { first_name: 'María', last_name: 'García', avatar: null },
    comments_count: 3,
    votes_count: 5,
  },
  {
    id: 2,
    title: 'Luminaria dañada',
    description:
      'Poste de luz en la calle 10 de Agosto no funciona hace una semana.',
    status: 'in_progress',
    priority: 'medium',
    category: { id: 2, name: 'Servicios' },
    geom: { type: 'Point', coordinates: [-80.7125, -0.948] },
    location_name: 'Calle 10 de Agosto',
    created_at: new Date().toISOString(),
    user: { first_name: 'Carlos', last_name: 'Mendoza', avatar: null },
    comments_count: 1,
    votes_count: 2,
  },
  {
    id: 3,
    title: 'Árbol caído',
    description: 'Árbol obstruye el paso peatonal en el parque central.',
    status: 'resolved',
    priority: 'low',
    category: { id: 3, name: 'Medio ambiente' },
    geom: { type: 'Point', coordinates: [-80.735, -0.96] },
    location_name: 'Parque Central',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    user: { first_name: 'Ana', last_name: 'Ruiz', avatar: null },
    comments_count: 0,
    votes_count: 8,
  },
];

const MOCK_CATEGORY_TREE = [
  {
    id: 1,
    name: 'Infraestructura',
    parent_id: null,
    children: [
      { id: 5, name: 'Vías', parent_id: 1, children: [] },
      { id: 6, name: 'Alumbrado público', parent_id: 1, children: [] },
    ],
  },
  { id: 2, name: 'Servicios', parent_id: null, children: [] },
  { id: 3, name: 'Medio ambiente', parent_id: null, children: [] },
];

// Two parents with children, to exercise the accordion's one-open-at-a-time
// behavior. Not the default tree — the default keeps leaf parents too.
const MOCK_TWO_BRANCH_TREE = [
  {
    id: 1,
    name: 'Infraestructura',
    parent_id: null,
    children: [{ id: 5, name: 'Vías', parent_id: 1, children: [] }],
  },
  {
    id: 2,
    name: 'Servicios',
    parent_id: null,
    children: [{ id: 7, name: 'Agua potable', parent_id: 2, children: [] }],
  },
  { id: 3, name: 'Medio ambiente', parent_id: null, children: [] },
];

function makeIncident(overrides) {
  return {
    id: 1,
    title: 'Incidencia',
    description: 'Descripción de la incidencia.',
    status: 'pending',
    priority: 'low',
    category: { id: 3, name: 'Medio ambiente' },
    user: { first_name: 'Ana', last_name: 'Ruiz', avatar: null },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeFakeL() {
  return {
    map: vi.fn(() => ({
      setView: vi.fn(function () {
        return this;
      }),
      remove: vi.fn(),
      invalidateSize: vi.fn(),
    })),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn(() => ({ addTo: vi.fn() })),
  };
}

describe('feed integration', () => {
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: Leaflet is unavailable in jsdom. The component swallows the
    // rejection, so pre-existing tests keep their current behavior.
    leafletLoader.loadLeaflet.mockRejectedValue(
      new Error('leaflet unavailable in jsdom'),
    );

    // Mock auth
    vi.spyOn(auth, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(auth, 'getUser').mockReturnValue({
      first_name: 'Admin',
      last_name: 'Test',
    });

    // Setup admin shell DOM + feed template (as router would)
    document.body.innerHTML = `
      <div id="main-wrapper" style="display:block">
        <div id="page-outlet">${FEED_TEMPLATE}</div>
      </div>
      <div id="auth-outlet"></div>
    `;

    fetchMock = vi.fn(async (url) => {
      if (url.includes('/incidents/feed')) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              data: MOCK_INCIDENTS,
              meta: { current_page: 1, last_page: 1 },
            }),
        };
      }
      if (url.includes('/incidents/stats')) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              total: 3,
              by_status: {
                pending: 1,
                in_progress: 1,
                resolved: 1,
              },
              by_priority: {
                high: 1,
                medium: 1,
                low: 1,
              },
              recent_count: 3,
              locations_count: 3,
              average_resolution_time: {
                formatted: '1d 2h',
                days: 1,
                hours: 2,
                seconds: 93600,
              },
              trends: {
                total_pct: 10.5,
                pendientes_pct: -5.0,
                resolution_rate_pct: 33,
              },
              top_categories: [],
            }),
        };
      }
      if (
        url.includes('feed.component.html') ||
        url.includes('feed.component.css')
      ) {
        return { ok: true, status: 200, text: vi.fn().mockResolvedValue('') };
      }
      return { ok: true, status: 200, text: vi.fn().mockResolvedValue('') };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads feed and renders cards with incident data', async () => {
    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const feedList = document.getElementById('feed-list');
    expect(feedList).not.toBeNull();

    // Verify cards were rendered
    const cards = feedList.querySelectorAll('.feed-card');
    expect(cards.length).toBe(3);

    // First card should contain user info and description
    expect(cards[0].textContent).toContain('María García');
    expect(cards[0].textContent).toContain('Prioridad: Alta');

    // Users without a photo get the default avatar image, not initials
    const cardAvatar = cards[0].querySelector('.ig-avatar-img');
    expect(cardAvatar).not.toBeNull();
    expect(cardAvatar.src).toContain('/images/default-avatar.svg');

    // Status badges — soft-fill chip classes
    expect(
      cards[0].querySelector('.feed-status-chip.feed-status-pending'),
    ).not.toBeNull();
    expect(
      cards[1].querySelector('.feed-status-chip.feed-status-in_progress'),
    ).not.toBeNull();
    expect(
      cards[2].querySelector('.feed-status-chip.feed-status-resolved'),
    ).not.toBeNull();

    // "Ver detalle" buttons
    const detailBtns = feedList.querySelectorAll(
      '.feed-action-btn[title="Ver detalle"]',
    );
    expect(detailBtns.length).toBe(3);

    // Single #feed container with Bootstrap row layout
    const feed = document.getElementById('feed');
    expect(feed).not.toBeNull();
    expect(feed.querySelector('.col-lg-8')).not.toBeNull();
    expect(feed.querySelector('.col-lg-4')).not.toBeNull();
    expect(document.getElementById('feed-desktop')).toBeNull();
    expect(document.getElementById('feed-mobile')).toBeNull();

    feedComponent.onDestroy();
  });

  it('shows empty state when no incidents', async () => {
    fetchMock = vi.fn(async (url) => {
      if (url.includes('/incidents/feed')) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              data: [],
              meta: { current_page: 1, last_page: 1 },
            }),
        };
      }
      return { ok: true, status: 200, text: vi.fn().mockResolvedValue('') };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const feedList = document.getElementById('feed-list');
    const vacio = document.getElementById('feed-vacio');

    expect(feedList.innerHTML).toBe('');
    expect(vacio.classList.contains('d-none')).toBe(false);

    feedComponent.onDestroy();
  });

  it('shows error state on API failure', async () => {
    fetchMock = vi.fn(async (url) => {
      if (url.includes('/incidents/feed')) {
        return {
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error('fail')),
        };
      }
      return { ok: true, status: 200, text: vi.fn().mockResolvedValue('') };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const vacio = document.getElementById('feed-vacio');
    expect(vacio.classList.contains('d-none')).toBe(false);
    const p = vacio.querySelector('p');
    expect(p.textContent).toBe('Error al cargar. Intente de nuevo.');

    feedComponent.onDestroy();
  });

  it('renders cards with correct structure', async () => {
    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const cards = document.querySelectorAll('.feed-card');
    expect(cards.length).toBeGreaterThan(0);

    const firstCard = cards[0];
    expect(firstCard.querySelector('.card-header')).not.toBeNull();
    expect(firstCard.querySelector('.fw-bold')).not.toBeNull();
    // feed-minimap present (incidents have geom, no thumbnail_url), but
    // HIDDEN by default — the toggle button is what actually loads it.
    expect(firstCard.querySelector('.feed-minimap')).not.toBeNull();
    expect(
      firstCard.querySelector('.feed-minimap').classList.contains('d-none'),
    ).toBe(true);
    // Opt-in toggle: "Ver mapa" button is visible, aria-expanded=false
    const toggle = firstCard.querySelector('.feed-map-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.querySelector('.feed-map-toggle__label').textContent).toBe(
      'Ver mapa',
    );
    expect(firstCard.querySelector('.card-body')).not.toBeNull();
    expect(firstCard.querySelector('.card-footer')).not.toBeNull();
    expect(
      firstCard.querySelector('.feed-status-chip.feed-status-pending'),
    ).not.toBeNull();
    expect(firstCard.classList.contains('feed-priority-high')).toBe(true);

    feedComponent.onDestroy();
  });

  it('clicking the map toggle flips aria-expanded and toggles label', async () => {
    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const toggle = document.querySelector('.feed-map-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    const minimap = document.getElementById(`feed-mm-${toggle.dataset.incId}`);
    expect(minimap).not.toBeNull();
    expect(minimap.classList.contains('d-none')).toBe(true);

    // Click → open. Leaflet is not loaded in jsdom, so the map element
    // stays hidden (loadLeaflet() rejects silently in the test env), but
    // the aria/label/visibility state must flip regardless.
    toggle.click();

    // The toggle's own state flips even if Leaflet fails to load.
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.querySelector('.feed-map-toggle__label').textContent).toBe(
      'Ocultar mapa',
    );
    expect(minimap.classList.contains('d-none')).toBe(false);

    // Click again → close.
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.querySelector('.feed-map-toggle__label').textContent).toBe(
      'Ver mapa',
    );
    expect(minimap.classList.contains('d-none')).toBe(true);

    feedComponent.onDestroy();
  });

  it('does not build a map when the toggle is collapsed during lazy load (TOCTOU race)', async () => {
    const fakeL = makeFakeL();
    vi.stubGlobal('L', fakeL);

    // Make loadLeaflet() stay pending until we resolve it manually.
    const deferred = {};
    deferred.promise = new Promise((resolve) => {
      deferred.resolve = resolve;
    });
    leafletLoader.loadLeaflet.mockResolvedValueOnce(deferred.promise);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const toggle = document.querySelector('.feed-map-toggle');
    expect(toggle).not.toBeNull();
    const container = document.getElementById(
      `feed-mm-${toggle.dataset.incId}`,
    );
    expect(container).not.toBeNull();

    // Expand: async init starts and stays pending.
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.classList.contains('d-none')).toBe(false);
    expect(leafletLoader.loadLeaflet).toHaveBeenCalledTimes(1);

    // Collapse while the load is still pending — the resumed init must NOT
    // build a map for a card the user asked to close.
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.classList.contains('d-none')).toBe(true);
    expect(container._leaflet_map).toBeUndefined();

    // Let the pending load finish and flush the resumed continuation.
    deferred.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fakeL.map).not.toHaveBeenCalled();
    expect(container._leaflet_map).toBeUndefined();
    expect(container.classList.contains('d-none')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.querySelector('.feed-map-toggle__label').textContent).toBe(
      'Ver mapa',
    );

    feedComponent.onDestroy();
  });

  // ── Category filter (TIPO panel) ──────────────────────────

  function categoriesFetchMock({
    incidents,
    categories = MOCK_CATEGORY_TREE,
  } = {}) {
    return vi.fn(async (url) => {
      if (url.includes('/incident-categories/tree')) {
        return {
          ok: true,
          json: () => Promise.resolve({ data: categories }),
        };
      }
      if (url.includes('/incidents/feed')) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              data: incidents,
              meta: { current_page: 1, last_page: 1 },
            }),
        };
      }
      if (url.includes('/incidents/stats')) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              total: 0,
              by_status: {},
              average_resolution_time: {},
            }),
        };
      }
      return { ok: true, status: 200, text: vi.fn().mockResolvedValue('') };
    });
  }

  // Accordion helpers — subcategories live behind a parent toggle.
  function categoryToggle(categoryId) {
    return document.querySelector(
      `#rp-category-filters .rp-cat-toggle[aria-controls="rp-cat-children-${categoryId}"]`,
    );
  }

  function expandParent(categoryId) {
    categoryToggle(categoryId).click();
  }

  function categoryBox(categoryId) {
    return document.querySelector(
      `#rp-category-filters .rp-checkbox-box[data-category-id="${categoryId}"]`,
    );
  }

  it('renders TIPO checkboxes from the category tree including subcategories', async () => {
    fetchMock = categoriesFetchMock({ incidents: MOCK_INCIDENTS });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const container = document.getElementById('rp-category-filters');
    const boxes = container.querySelectorAll('.rp-checkbox-box');
    expect(boxes.length).toBe(5);
    boxes.forEach((box) => {
      expect(box.dataset.categoryId).not.toBe('');
    });

    const labels = [...container.querySelectorAll('.rp-checkbox-label')];
    expect(labels).toHaveLength(5);

    // Every checkbox carries its category id
    expect(categoryBox(1)).not.toBeNull();
    expect(categoryBox(5)).not.toBeNull();

    // Subcategory lives behind the parent toggle — hidden by default
    const viasChildren = document.getElementById('rp-cat-children-1');
    expect(viasChildren).not.toBeNull();
    expect(viasChildren.hidden).toBe(true);

    // Expanding the parent reveals its subcategories, indented
    expandParent(1);
    expect(viasChildren.hidden).toBe(false);
    const viasLabel = labels.find((l) => l.textContent.includes('Vías'));
    expect(viasLabel).not.toBeNull();
    expect(viasLabel.style.paddingLeft).toBe('20px');

    feedComponent.onDestroy();
  });

  it('keeps the feed unfiltered when the category tree fetch fails', async () => {
    fetchMock = vi.fn(async (url) => {
      if (url.includes('/incident-categories/tree')) {
        return {
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error('fail')),
        };
      }
      if (url.includes('/incidents/feed')) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              data: MOCK_INCIDENTS,
              meta: { current_page: 1, last_page: 1 },
            }),
        };
      }
      if (url.includes('/incidents/stats')) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              total: 0,
              by_status: {},
              average_resolution_time: {},
            }),
        };
      }
      return { ok: true, status: 200, text: vi.fn().mockResolvedValue('') };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    expect(
      document.querySelectorAll('#rp-category-filters .rp-checkbox-box').length,
    ).toBe(0);
    expect(document.querySelectorAll('.feed-card').length).toBe(3);

    feedComponent.onDestroy();
  });

  it('filtering by a parent category includes incidents of its subcategories', async () => {
    const incidents = [
      makeIncident({
        id: 11,
        title: 'Bache en la avenida',
        category: { id: 5, name: 'Vías' },
      }),
      makeIncident({
        id: 12,
        title: 'Luminaria apagada',
        category: { id: 6, name: 'Alumbrado público' },
      }),
      makeIncident({
        id: 13,
        title: 'Basura acumulada',
        category: { id: 3, name: 'Medio ambiente' },
      }),
    ];
    fetchMock = categoriesFetchMock({ incidents });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    // Default: no category checked, every incident visible
    expect(document.querySelectorAll('.feed-card').length).toBe(3);

    // Checking the "Infraestructura" parent (id 1) must also match its
    // subcategory incidents (Vías, Alumbrado público).
    const parentBox = document.querySelector(
      '#rp-category-filters .rp-checkbox-box[data-category-id="1"]',
    );
    parentBox.click();

    const cards = document.querySelectorAll('.feed-card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Bache en la avenida');
    expect(cards[1].textContent).toContain('Luminaria apagada');

    feedComponent.onDestroy();
  });

  it('filtering by a subcategory only includes incidents of that subcategory', async () => {
    const incidents = [
      makeIncident({
        id: 21,
        title: 'Vía dañada',
        category: { id: 5, name: 'Vías' },
      }),
      makeIncident({
        id: 22,
        title: 'Poste sin luz',
        category: { id: 6, name: 'Alumbrado público' },
      }),
    ];
    fetchMock = categoriesFetchMock({ incidents });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    // Subcategory checkboxes are hidden behind their parent — expand first.
    expandParent(1);
    const subBox = categoryBox(5);
    expect(subBox).not.toBeNull();
    subBox.click();

    const cards = document.querySelectorAll('.feed-card');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('Vía dañada');

    feedComponent.onDestroy();
  });

  it('filters by category id, not by label text', async () => {
    const incidents = [
      makeIncident({
        id: 31,
        title: 'Atención ciudadana',
        category: { id: 2, name: 'Servicios' },
      }),
      // Same label text as the checked category but a different id — the
      // name-based matcher would include it, the id-based one must not.
      makeIncident({
        id: 32,
        title: 'Falsa coincidencia de nombre',
        category: { id: 9, name: 'Servicios' },
      }),
    ];
    fetchMock = categoriesFetchMock({ incidents });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const servicesBox = document.querySelector(
      '#rp-category-filters .rp-checkbox-box[data-category-id="2"]',
    );
    servicesBox.click();

    const cards = document.querySelectorAll('.feed-card');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('Atención ciudadana');

    feedComponent.onDestroy();
  });

  it('checking a subcategory clears its checked parent so the sub wins', async () => {
    const incidents = [
      makeIncident({
        id: 41,
        title: 'Vía dañada',
        category: { id: 5, name: 'Vías' },
      }),
      makeIncident({
        id: 42,
        title: 'Poste sin luz',
        category: { id: 6, name: 'Alumbrado público' },
      }),
    ];
    fetchMock = categoriesFetchMock({ incidents });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    // Parent checked first → both subcategory incidents visible.
    const parentBox = categoryBox(1);
    parentBox.click();
    expect(document.querySelectorAll('.feed-card').length).toBe(2);

    // Expanding shows the subcategories; checking one must clear the parent.
    expandParent(1);
    const subBox = categoryBox(5);
    subBox.click();

    // The parent checkbox is now unchecked and the list narrows to the sub.
    expect(categoryBox(1).checked).toBe(false);
    expect(categoryBox(1).classList.contains('checked')).toBe(false);
    const cards = document.querySelectorAll('.feed-card');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('Vía dañada');

    feedComponent.onDestroy();
  });

  it('checking a parent clears its checked subcategories', async () => {
    const incidents = [
      makeIncident({
        id: 51,
        title: 'Vía dañada',
        category: { id: 5, name: 'Vías' },
      }),
      makeIncident({
        id: 52,
        title: 'Poste sin luz',
        category: { id: 6, name: 'Alumbrado público' },
      }),
    ];
    fetchMock = categoriesFetchMock({ incidents });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    // Subcategory checked alone first → only its incident visible.
    expandParent(1);
    categoryBox(5).click();
    expect(document.querySelectorAll('.feed-card').length).toBe(1);

    // Checking the parent clears the subcategory and widens the list.
    categoryBox(1).click();
    expect(categoryBox(5).checked).toBe(false);
    expect(categoryBox(5).classList.contains('checked')).toBe(false);
    const cards = document.querySelectorAll('.feed-card');
    expect(cards.length).toBe(2);

    feedComponent.onDestroy();
  });

  it('two subcategories of the same parent stay independent', async () => {
    const incidents = [
      makeIncident({
        id: 61,
        title: 'Vía dañada',
        category: { id: 5, name: 'Vías' },
      }),
      makeIncident({
        id: 62,
        title: 'Poste sin luz',
        category: { id: 6, name: 'Alumbrado público' },
      }),
    ];
    fetchMock = categoriesFetchMock({ incidents });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    expandParent(1);
    categoryBox(5).click();
    categoryBox(6).click();

    // Both subs stay checked (each clears only its own parent, not a sibling)
    // and the filter matches the union of both.
    expect(categoryBox(5).checked).toBe(true);
    expect(categoryBox(6).checked).toBe(true);
    expect(document.querySelectorAll('.feed-card').length).toBe(2);

    feedComponent.onDestroy();
  });

  // ── Category accordion (progressive disclosure) ──────────

  it('by default only parent categories are visible and subcategories stay hidden', async () => {
    fetchMock = categoriesFetchMock({ incidents: MOCK_INCIDENTS });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const container = document.getElementById('rp-category-filters');

    // Three parent rows are direct children; no subcategory row escapes its
    // collapsible container.
    const parentRows = [...container.children].filter((el) =>
      el.classList.contains('rp-cat-row'),
    );
    expect(parentRows).toHaveLength(3);

    // The single branch (Infraestructura) starts collapsed.
    const childrenContainers = [
      ...container.querySelectorAll('.rp-cat-children'),
    ];
    expect(childrenContainers).toHaveLength(1);
    expect(childrenContainers[0].hidden).toBe(true);

    // Subcategory checkboxes exist in the DOM but are not visible yet.
    expect(categoryBox(5)).not.toBeNull();
    expect(categoryBox(5).closest('.rp-cat-children').hidden).toBe(true);

    feedComponent.onDestroy();
  });

  it('clicking a parent toggle expands only that parent and collapses the previously open one', async () => {
    fetchMock = categoriesFetchMock({
      incidents: MOCK_INCIDENTS,
      categories: MOCK_TWO_BRANCH_TREE,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const childrenOf = (id) => document.getElementById(`rp-cat-children-${id}`);

    expect(childrenOf(1).hidden).toBe(true);
    expect(childrenOf(2).hidden).toBe(true);

    expandParent(1);
    expect(childrenOf(1).hidden).toBe(false);
    expect(categoryToggle(1).getAttribute('aria-expanded')).toBe('true');

    // Opening the second parent collapses the first (one open at a time).
    expandParent(2);
    expect(childrenOf(1).hidden).toBe(true);
    expect(childrenOf(2).hidden).toBe(false);
    expect(categoryToggle(1).getAttribute('aria-expanded')).toBe('false');
    expect(categoryToggle(2).getAttribute('aria-expanded')).toBe('true');

    // Clicking an open toggle collapses it again.
    categoryToggle(2).click();
    expect(childrenOf(2).hidden).toBe(true);
    expect(categoryToggle(2).getAttribute('aria-expanded')).toBe('false');

    feedComponent.onDestroy();
  });

  it('checking a parent auto-expands it and filters by its id including descendants', async () => {
    const incidents = [
      makeIncident({
        id: 11,
        title: 'Bache en la avenida',
        category: { id: 5, name: 'Vías' },
      }),
      makeIncident({
        id: 12,
        title: 'Luminaria apagada',
        category: { id: 6, name: 'Alumbrado público' },
      }),
      makeIncident({
        id: 13,
        title: 'Basura acumulada',
        category: { id: 3, name: 'Medio ambiente' },
      }),
    ];
    fetchMock = categoriesFetchMock({ incidents });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const childrenContainer = document.getElementById('rp-cat-children-1');
    expect(childrenContainer.hidden).toBe(true);

    // Checking the parent auto-expands its branch.
    categoryBox(1).click();
    expect(childrenContainer.hidden).toBe(false);
    expect(categoryToggle(1).getAttribute('aria-expanded')).toBe('true');

    // And filters by the parent id, matching its subcategory incidents.
    const cards = document.querySelectorAll('.feed-card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Bache en la avenida');
    expect(cards[1].textContent).toContain('Luminaria apagada');

    feedComponent.onDestroy();
  });

  it('checking a subcategory (after expanding) filters only by that subcategory id', async () => {
    const incidents = [
      makeIncident({
        id: 21,
        title: 'Vía dañada',
        category: { id: 5, name: 'Vías' },
      }),
      makeIncident({
        id: 22,
        title: 'Poste sin luz',
        category: { id: 6, name: 'Alumbrado público' },
      }),
    ];
    fetchMock = categoriesFetchMock({ incidents });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    expandParent(1);
    categoryBox(5).click();

    const cards = document.querySelectorAll('.feed-card');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('Vía dañada');

    feedComponent.onDestroy();
  });

  it('the chevron toggle never changes the checkbox state', async () => {
    fetchMock = categoriesFetchMock({ incidents: MOCK_INCIDENTS });
    vi.stubGlobal('fetch', fetchMock);

    const { default: feedComponent } = await import('./feed.component.js');
    await feedComponent.onInit();

    const parentBox = categoryBox(1);
    expect(parentBox.checked).toBe(false);
    expect(parentBox.classList.contains('checked')).toBe(false);

    // Open and close the branch — the parent checkbox must stay untouched.
    categoryToggle(1).click();
    expect(parentBox.checked).toBe(false);
    expect(parentBox.classList.contains('checked')).toBe(false);

    categoryToggle(1).click();
    expect(parentBox.checked).toBe(false);
    expect(parentBox.classList.contains('checked')).toBe(false);

    feedComponent.onDestroy();
  });
});
