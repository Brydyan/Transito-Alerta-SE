/**
 * appShell unit tests — lifecycle (T-1.8) and role-specific rendering (T-1.10).
 *
 * Tests the appShell interface (mount + init + destroy + outlet + updateActive)
 * across the three role buckets: admin, citizen, guest.
 */
import { auth } from '../auth/auth.service.js';
import { menuService } from '../shared/menu.service.js';
import { notificationService } from '../shared/notification.service.js';
import { OPERATIONAL_ROLES } from '../utils/role.js';
import { resolveAvatar } from '../utils/avatar.js';

const TEMPLATE_HTML = `
<div class="app-shell">
<header class="app-shell-header">
  <button type="button" class="app-shell-sidebar-toggle" id="app-shell-sidebar-toggle" aria-label="Alternar barra lateral" aria-controls="app-shell-sidebar" aria-expanded="true">
<i class="fa-solid fa-angles-left app-shell-sidebar-toggle__icon" aria-hidden="true"></i>
  </button>
  <div class="app-shell-header__brand">GeoReporta</div>

  <!-- Admin-only header (notifications + user menu) -->
  <div class="app-shell-header__admin" data-show-on-role="admin">
    <div class="app-shell-user-menu">
      <button class="app-shell-user-menu__trigger" id="app-shell-user-menu-trigger" aria-haspopup="menu" aria-expanded="false">
    <span class="app-shell-user-menu__avatar" id="app-shell-user-avatar">U</span>
    <span class="app-shell-user-menu__name" id="app-shell-user-name">Usuario</span>
      </button>
      <ul role="menu" id="app-shell-user-menu-panel" class="app-shell-user-menu__panel" hidden>
    <li role="menuitem" tabindex="-1" id="app-shell-user-menu-profile" class="app-shell-user-menu__item">Mi perfil</li>
    <li role="menuitem" tabindex="-1" id="app-shell-user-menu-logout" class="app-shell-user-menu__item app-shell-user-menu__item--logout" aria-disabled="false">Cerrar sesión</li>
      </ul>
    </div>
  </div>

<!-- Citizen header (bell + user menu dropdown) -->
  <div class="app-shell-header__citizen" data-show-on-role="citizen">
    <button class="app-shell-header__bell" id="app-shell-bell">
      <i class="fa-regular fa-bell"></i>
    </button>
    <div class="app-shell-user-menu app-shell-user-menu--compact">
      <button class="app-shell-user-menu__trigger app-shell-user-menu__trigger--avatar" id="app-shell-citizen-menu-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="Menú de usuario">
    <span class="app-shell-avatar__letter" id="app-shell-avatar">?</span>
      </button>
      <ul role="menu" id="app-shell-citizen-menu-panel" class="app-shell-user-menu__panel" hidden>
    <li role="menuitem" tabindex="-1" id="app-shell-citizen-menu-profile" class="app-shell-user-menu__item">Mi perfil</li>
    <li role="menuitem" tabindex="-1" id="app-shell-citizen-menu-logout" class="app-shell-user-menu__item app-shell-user-menu__item--logout" aria-disabled="false">Cerrar sesión</li>
      </ul>
    </div>
  </div>

  <!-- Guest header (login button) -->
  <a href="#/login" class="app-shell-login-btn" id="app-shell-login-btn" data-show-on-role="guest">
    Ingresar
  </a>
</header>

</div>
<aside class="app-shell-sidebar" id="app-shell-sidebar">
  <!-- Admin sidebar nav (T-2.6: now DB-driven, ul has id for renderer targeting) -->
  <nav class="app-shell-sidebar__nav" id="app-shell-admin-sidebar" data-show-on-role="admin">
    <ul class="app-shell-sidebar__list" id="app-shell-admin-menu-list">
      <!-- Renderizado dinámico desde GET /api/menus/my -->
    </ul>
  </nav>

  <!-- Citizen sidebar nav (T-2.7: now DB-driven, ul has id for renderer targeting) -->
  <nav class="app-shell-sidebar__nav" id="app-shell-citizen-sidebar" data-show-on-role="citizen">
    <ul class="app-shell-sidebar__list app-shell-sidebar__list--flat" id="app-shell-citizen-menu-list">
      <!-- Renderizado dinámico desde GET /api/menus/my -->
    </ul>
  </nav>
</aside>

<main class="app-shell-main">
  <div id="page-outlet"></div>
</main>

<nav class="app-shell-bottom-nav">
  <!-- Admin bottom nav: 4 items, 3rd slot is "Crear incidencia" (T-2.7: Alertas removed) -->
  <!-- T-3.4: Admin bottom nav - now DB-driven via renderBottomNavMenu -->
  <ul id="app-shell-bottom-nav-list" class="app-shell-bottom-nav-list"></ul>

  <!-- T-3.4 + Cleanup: Citizen bottom nav is DB-driven and the "+" plus
       button is now synthesized inside the <ul> at index 1 (between Feed
       and Perfil) by renderBottomNavMenu. It used to be a hardcoded
       sibling of the <ul>, which placed it at the far-right slot 3/3
       because the <ul> has display: contents. -->
  <ul id="app-shell-citizen-bottom-nav-list" class="app-shell-citizen-bottom-nav-list"></ul>
</nav>
`;

/**
 * Same shell markup as TEMPLATE_HTML, but with the FULL production citizen
 * bell markup (bell-wrapper, panel, list, badge, empty-state) instead of
 * the trimmed-down bell button used by the rest of this file's fixtures.
 * Scoped to the notification-bell describe block below so it doesn't
 * change the DOM shape any other test in this file relies on.
 */
const TEMPLATE_HTML_WITH_BELL = TEMPLATE_HTML.replace(
  `<div class="app-shell-header__citizen" data-show-on-role="citizen">
    <button class="app-shell-header__bell" id="app-shell-bell">
      <i class="fa-regular fa-bell"></i>
    </button>`,
  `<div class="app-shell-header__citizen" data-show-on-role="citizen">
    <div class="app-shell-bell-wrapper">
      <button class="app-shell-header__bell" id="app-shell-bell" type="button" aria-label="Notificaciones" aria-haspopup="true" aria-expanded="false" aria-controls="app-shell-bell-panel">
        <i class="fa-regular fa-bell"></i>
        <span class="app-shell-header__notif-badge d-none" id="app-shell-bell-badge">0</span>
      </button>
      <div class="app-shell-user-menu__panel app-shell-bell-panel" id="app-shell-bell-panel" hidden>
        <div class="app-shell-bell-panel__header">Notificaciones</div>
        <ul class="app-shell-bell-panel__list" id="app-shell-bell-list">
          <li class="app-shell-bell-panel__empty" id="app-shell-bell-empty">Sin notificaciones</li>
        </ul>
      </div>
    </div>`,
);

function htmlResponse(body) {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(body),
  };
}

function mockFetchTemplate(templateHtml = TEMPLATE_HTML) {
  return vi.fn(async (url) => {
    if (url.includes('app-shell.component.html')) {
      return htmlResponse(templateHtml);
    }
    return htmlResponse('');
  });
}

describe('appShell — lifecycle (T-1.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren(
      Object.assign(document.createElement('div'), {
        id: 'shell-outlet',
      }),
    );
    document.body.removeAttribute('data-role');
    vi.stubGlobal('fetch', mockFetchTemplate());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mount() injects template HTML into #shell-outlet', async () => {
    const { appShell } = await import('./app-shell.component.js');

    await appShell.mount();

    const outlet = document.getElementById('shell-outlet');
    expect(outlet.querySelector('.app-shell-header')).toBeTruthy();
    expect(outlet.querySelector('.app-shell-sidebar')).toBeTruthy();
    expect(outlet.querySelector('.app-shell-main')).toBeTruthy();
    expect(outlet.querySelector('.app-shell-bottom-nav')).toBeTruthy();
    expect(outlet.querySelector('#page-outlet')).toBeTruthy();
  });

  it('init() sets body.dataset.role', async () => {
    const { appShell } = await import('./app-shell.component.js');

    await appShell.mount();
    const unsub = await appShell.init();

    expect(document.body.dataset.role).toBeTruthy();
    expect(['admin', 'citizen', 'guest']).toContain(document.body.dataset.role);

    if (typeof unsub === 'function') unsub();
  });

  it('outlet property is "#page-outlet"', async () => {
    const { appShell } = await import('./app-shell.component.js');

    expect(appShell.outlet).toBe('#page-outlet');
  });

  it('updateActive(path) toggles .active on matching data-route items', async () => {
    // Mock auth to render nav items (admin role triggers dynamic rendering)
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 1,
      first_name: 'Admin',
      last_name: 'User',
      email: 'admin@example.com',
      role: { id: 1, name: 'admin_sistema' },
    });
    vi.spyOn(menuService, 'getMyMenu').mockResolvedValue([
      {
        id: 1,
        parent_id: null,
        name: 'Dashboard',
        route: '/dashboard',
        icon: 'gauge-high',
        children: [],
      },
      {
        id: 2,
        parent_id: null,
        name: 'Incidencias',
        route: '/incidencias',
        icon: 'list',
        children: [],
      },
    ]);

    const { appShell } = await import('./app-shell.component.js');

    await appShell.mount();
    await appShell.init();

    // Before: nothing active
    const itemsBefore = document.querySelectorAll('.app-shell-nav-item');
    expect(itemsBefore.length).toBeGreaterThan(0);
    itemsBefore.forEach((item) => {
      expect(item.classList.contains('active')).toBe(false);
    });

    // Activate /incidencias
    appShell.updateActive('/incidencias');

    const active = document.querySelectorAll('.app-shell-nav-item.active');
    expect(active.length).toBeGreaterThan(0);
    active.forEach((item) => {
      expect(item.dataset.route).toBe('/incidencias');
    });

    // Activate a different path — old active should clear
    appShell.updateActive('/dashboard');
    const dashboardActive = document.querySelectorAll(
      '.app-shell-nav-item.active',
    );
    expect(dashboardActive.length).toBeGreaterThan(0);
    dashboardActive.forEach((item) => {
      expect(item.dataset.route).toBe('/dashboard');
    });
  });

  it('destroy() is callable and does not throw', async () => {
    const { appShell } = await import('./app-shell.component.js');

    await appShell.mount();
    await appShell.init();

    expect(() => appShell.destroy()).not.toThrow();
  });
});

/**
 * Sidebar collapse/expand toggle tests.
 *
 * The toggle button (#app-shell-sidebar-toggle) lives in the header and
 * works in two modes:
 *   - Desktop (>=768px): toggles a persisted collapsed preference that
 *     narrows the grid from 240px to 72px (icon-only). State persists
 *     across sessions via localStorage.
 *   - Mobile (<768px): opens/closes an off-canvas overlay. State is
 *     transient (not persisted) because the sidebar is off-screen by
 *     default on mobile.
 */
describe('appShell — sidebar toggle', () => {
  // jsdom 25 does not expose localStorage for opaque origins, so we
  // install an in-memory mock for tests that exercise persistence.
  const memoryStorage = (() => {
    const store = new Map();
    return {
      getItem: vi.fn((k) => (store.has(k) ? store.get(k) : null)),
      setItem: vi.fn((k, v) => store.set(k, String(v))),
      removeItem: vi.fn((k) => store.delete(k)),
      clear: vi.fn(() => store.clear()),
    };
  })();

  beforeEach(() => {
    vi.clearAllMocks();
    memoryStorage.clear();
    // Install localStorage before the appShell runs so init() can read
    // the persisted collapsed preference. jsdom returns undefined
    // here, so we stub a fresh in-memory implementation per test.
    Object.defineProperty(window, 'localStorage', {
      value: memoryStorage,
      writable: true,
      configurable: true,
    });
    document.body.replaceChildren(
      Object.assign(document.createElement('div'), {
        id: 'shell-outlet',
      }),
    );
    document.body.removeAttribute('data-role');
    vi.stubGlobal('fetch', mockFetchTemplate());
    try {
      localStorage.clear();
    } catch (_e) {
      /* storage may be disabled in jsdom */
    }
    // Default matchMedia: desktop viewport. Individual tests can override.
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: !/max-width.*7\d{2}/.test(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a sidebar toggle button in the header', async () => {
    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    await appShell.init();

    const btn = document.getElementById('app-shell-sidebar-toggle');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBeTruthy();
    expect(btn.getAttribute('aria-controls')).toBe('app-shell-sidebar');
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    appShell.destroy();
  });

  it('toggles the desktop collapsed class on the grid container', async () => {
    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    await appShell.init();

    const grid = document.querySelector('.app-shell');
    const btn = document.getElementById('app-shell-sidebar-toggle');

    expect(grid.classList.contains('app-shell--sidebar-collapsed')).toBe(false);
    btn.click();
    expect(grid.classList.contains('app-shell--sidebar-collapsed')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    expect(grid.classList.contains('app-shell--sidebar-collapsed')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    appShell.destroy();
  });

  it('persists the desktop collapsed preference to localStorage', async () => {
    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    await appShell.init();

    const btn = document.getElementById('app-shell-sidebar-toggle');
    btn.click();
    expect(localStorage.getItem('appShell:sidebarCollapsed')).toBe('1');
    btn.click();
    expect(localStorage.getItem('appShell:sidebarCollapsed')).toBe('0');

    appShell.destroy();
  });

  it('restores the desktop collapsed preference on init', async () => {
    try {
      localStorage.setItem('appShell:sidebarCollapsed', '1');
    } catch (_e) {
      /* skip if storage disabled */
    }

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    await appShell.init();

    const grid = document.querySelector('.app-shell');
    const btn = document.getElementById('app-shell-sidebar-toggle');
    expect(grid.classList.contains('app-shell--sidebar-collapsed')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');

    appShell.destroy();
  });

  it('opens the mobile off-canvas overlay when the toggle is clicked', async () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: /max-width.*7\d{2}/.test(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    await appShell.init();

    const sidebar = document.getElementById('app-shell-sidebar');
    const btn = document.getElementById('app-shell-sidebar-toggle');

    expect(sidebar.classList.contains('is-open')).toBe(false);
    btn.click();
    expect(sidebar.classList.contains('is-open')).toBe(true);
    const backdrop = document.querySelector('.app-shell-sidebar-backdrop');
    expect(backdrop).toBeTruthy();
    expect(backdrop.classList.contains('is-open')).toBe(true);

    btn.click();
    expect(sidebar.classList.contains('is-open')).toBe(false);
    expect(backdrop.classList.contains('is-open')).toBe(false);

    appShell.destroy();
  });

  it('closes the mobile overlay when the backdrop is clicked', async () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: /max-width.*7\d{2}/.test(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    await appShell.init();

    const btn = document.getElementById('app-shell-sidebar-toggle');
    const sidebar = document.getElementById('app-shell-sidebar');
    btn.click();
    expect(sidebar.classList.contains('is-open')).toBe(true);

    const backdrop = document.querySelector('.app-shell-sidebar-backdrop');
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sidebar.classList.contains('is-open')).toBe(false);

    appShell.destroy();
  });

  it('closes the mobile overlay when Escape is pressed', async () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: /max-width.*7\d{2}/.test(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    await appShell.init();

    const btn = document.getElementById('app-shell-sidebar-toggle');
    const sidebar = document.getElementById('app-shell-sidebar');
    btn.click();
    expect(sidebar.classList.contains('is-open')).toBe(true);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(sidebar.classList.contains('is-open')).toBe(false);

    appShell.destroy();
  });

  it('destroy() removes the mobile backdrop from the DOM', async () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: /max-width.*7\d{2}/.test(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    await appShell.init();

    const btn = document.getElementById('app-shell-sidebar-toggle');
    btn.click();
    const backdrop = document.querySelector('.app-shell-sidebar-backdrop');
    expect(backdrop).toBeTruthy();

    appShell.destroy();

    expect(document.querySelector('.app-shell-sidebar-backdrop')).toBeFalsy();
  });
});

describe('appShell — role-specific rendering (T-1.10)', () => {
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren(
      Object.assign(document.createElement('div'), {
        id: 'shell-outlet',
      }),
    );
    document.body.removeAttribute('data-role');
    fetchMock = mockFetchTemplate();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('data-role="admin" renders admin nav items in DOM after init', async () => {
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 1,
      first_name: 'Maria',
      last_name: 'Gonzalez',
      email: 'maria@example.com',
      role: { id: 1, name: 'admin_sistema' },
    });
    // T-2.6: sidebar now driven by menuService.getMyMenu(). Stub it
    // so the renderer populates the admin <ul> with deterministic data.
    vi.spyOn(menuService, 'getMyMenu').mockResolvedValue([
      {
        id: 1,
        parent_id: null,
        name: 'Dashboard',
        route: '/dashboard',
        icon: 'gauge-high',
        children: [],
      },
      {
        id: 2,
        parent_id: null,
        name: 'Incidencias',
        route: '/incidencias',
        icon: 'list',
        children: [],
      },
      {
        id: 4,
        parent_id: null,
        name: 'Nueva Incidencia',
        route: '/incidencias/crear',
        icon: 'circle-plus',
        children: [],
      },
    ]);
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValue(0);

    const { appShell } = await import('./app-shell.component.js');

    await appShell.mount();
    const unsub = await appShell.init();

    // Drain the renderer's microtask chain.
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();

    expect(document.body.dataset.role).toBe('admin');

    // Admin sidebar nav must be present
    expect(document.getElementById('app-shell-admin-sidebar')).toBeTruthy();

    // Admin sidebar items now come from the mocked /menus/my payload.
    const adminList = document.getElementById('app-shell-admin-menu-list');
    const anchors = adminList.querySelectorAll('a.app-shell-nav-item');
    expect(anchors.length).toBe(3);
    expect(anchors[0].dataset.route).toBe('/dashboard');
    expect(anchors[1].dataset.route).toBe('/incidencias');
    expect(anchors[2].dataset.route).toBe('/incidencias/crear');

    // T-2.2: icon-className assertions (R1.4, RX.2)
    expect(anchors[0].querySelector('i').className).toBe(
      'fa-solid fa-gauge-high',
    );
    expect(anchors[1].querySelector('i').className).toBe('fa-solid fa-list');
    expect(anchors[2].querySelector('i').className).toBe(
      'fa-solid fa-circle-plus',
    );

    // T-2.7: /mapa and /alertas must NOT be rendered anywhere in the bottom nav.
    expect(
      document.querySelectorAll('.app-shell-bottom-nav a[href^="#/mapa"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelectorAll('.app-shell-bottom-nav a[href^="#/alertas"]')
        .length,
    ).toBe(0);

    if (typeof unsub === 'function') unsub();
  });

  it('data-role="citizen" renders citizen nav items in DOM after init', async () => {
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 2,
      first_name: 'Juan',
      email: 'juan@example.com',
      role: { id: 5, name: 'usuario' },
    });
    // T-2.6: citizen sidebar now driven by /menus/my.
    vi.spyOn(menuService, 'getMyMenu').mockResolvedValue([
      {
        id: 16,
        parent_id: null,
        name: 'Inicio',
        route: '/feed',
        icon: 'house',
        children: [],
      },
      {
        id: 17,
        parent_id: null,
        name: 'Reportar',
        route: '/feed/crear',
        icon: 'circle-plus',
        children: [],
      },
      {
        id: 18,
        parent_id: null,
        name: 'Perfil',
        route: '/configuracion/perfil',
        icon: 'user',
        children: [],
      },
    ]);

    const { appShell } = await import('./app-shell.component.js');

    await appShell.mount();
    const unsub = await appShell.init();

    expect(document.body.dataset.role).toBe('citizen');

    // Citizen sidebar nav must be present
    expect(document.getElementById('app-shell-citizen-sidebar')).toBeTruthy();

    // Drain the renderer's microtask chain.
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();

    // Citizen sidebar items now come from the mocked /menus/my payload.
    const citizenList = document.getElementById('app-shell-citizen-menu-list');
    const anchors = citizenList.querySelectorAll('a.app-shell-nav-item');
    expect(anchors.length).toBe(3);
    expect(anchors[0].dataset.route).toBe('/feed');
    expect(anchors[1].dataset.route).toBe('/feed/crear');
    expect(anchors[2].dataset.route).toBe('/configuracion/perfil');

    // T-2.2: icon-className assertions (R1.4, RX.2)
    expect(anchors[0].querySelector('i').className).toBe('fa-solid fa-house');
    expect(anchors[1].querySelector('i').className).toBe(
      'fa-solid fa-circle-plus',
    );
    expect(anchors[2].querySelector('i').className).toBe('fa-solid fa-user');

    // T-2.7: /mapa and /alertas MUST NOT appear anywhere in the
    // citizen sidebar or bottom-nav. The original hardcoded citizen
    // sidebar items (Inicio/Mapa/Alertas/Perfil) are gone.
    expect(
      document.querySelectorAll('.app-shell-bottom-nav a[href^="#/mapa"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelectorAll('.app-shell-bottom-nav a[href^="#/alertas"]')
        .length,
    ).toBe(0);
    expect(
      document.querySelectorAll(
        '#app-shell-citizen-sidebar a[href^="#/mapa"], #app-shell-citizen-sidebar a[href^="#/alertas"]',
      ).length,
    ).toBe(0);

    if (typeof unsub === 'function') unsub();
  });

  it('data-role="guest" makes the login button visible after init', async () => {
    vi.spyOn(auth, 'getUser').mockReturnValue(null);

    const { appShell } = await import('./app-shell.component.js');

    await appShell.mount();
    const unsub = await appShell.init();

    expect(document.body.dataset.role).toBe('guest');

    // Login button must be present
    const loginBtn = document.getElementById('app-shell-login-btn');
    expect(loginBtn).toBeTruthy();
    expect(loginBtn.getAttribute('href')).toBe('#/login');

    if (typeof unsub === 'function') unsub();
  });
});

/**
 * User-menu dropdown tests (T-1.11.14) — WAI-ARIA menu-button pattern.
 *
 * Covers REQ-1 through REQ-7 of the navbar-restructuring spec:
 *   - REQ-1: trigger exposes aria-haspopup + toggles aria-expanded
 *   - REQ-2: panel has exactly 2 role="menuitem" items, hidden by default
 *   - REQ-3: "Mi perfil" navigates + closes
 *   - REQ-4: "Cerrar sesión" awaits auth.logout() then redirects + role flip
 *   - REQ-5: Escape closes + restores focus
 *   - REQ-6: outside-click closes; destroy() removes listeners
 *   - REQ-7: mobile CSS fallback present in source
 */
describe('user-menu dropdown (T-1.11)', () => {
  let consoleErrorSpy;

  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.replaceChildren(
      Object.assign(document.createElement('div'), {
        id: 'shell-outlet',
      }),
    );
    document.body.removeAttribute('data-role');
    vi.stubGlobal('fetch', mockFetchTemplate());
    // Set up admin user so init() classifies as 'admin' and populates header.
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 1,
      first_name: 'Maria',
      last_name: 'Gonzalez',
      email: 'maria@example.com',
      role: { id: 1, name: 'admin_sistema' },
    });
    vi.spyOn(auth, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});
    // auth.me() returns null by default unless overridden — tests that need
    // the header populated override this per-test.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  async function mountAsAdmin() {
    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();
    return { appShell, unsub };
  }

  function refs() {
    return {
      trigger: document.getElementById('app-shell-user-menu-trigger'),
      panel: document.getElementById('app-shell-user-menu-panel'),
      profile: document.getElementById('app-shell-user-menu-profile'),
      logout: document.getElementById('app-shell-user-menu-logout'),
    };
  }

  // Case 1: Open toggle — click trigger → aria-expanded="true", hidden removed.
  it('opens the panel on trigger click (aria-expanded="true", hidden removed)', async () => {
    const { appShell, unsub } = await mountAsAdmin();
    try {
      const { trigger, panel } = refs();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(panel.hasAttribute('hidden')).toBe(true);

      trigger.click();

      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(panel.hasAttribute('hidden')).toBe(false);
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  // Case 2: Close toggle — second click → hidden re-added, aria-expanded="false".
  it('closes the panel on second trigger click', async () => {
    const { appShell, unsub } = await mountAsAdmin();
    try {
      const { trigger, panel } = refs();
      trigger.click();
      expect(panel.hasAttribute('hidden')).toBe(false);

      trigger.click();

      expect(panel.hasAttribute('hidden')).toBe(true);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  // Case 3: Escape closes + restores focus to trigger.
  it('Escape key closes the panel and restores focus to the trigger', async () => {
    const { appShell, unsub } = await mountAsAdmin();
    try {
      const { trigger, panel } = refs();
      trigger.click();
      expect(panel.hasAttribute('hidden')).toBe(false);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );

      expect(panel.hasAttribute('hidden')).toBe(true);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  // Case 4: Mi perfil — hash set + panel closes.
  it('"Mi perfil" sets window.location.hash to "#/configuracion/perfil" and closes the panel', async () => {
    const { appShell, unsub } = await mountAsAdmin();
    try {
      const hashSpy = vi.fn();
      const originalHash = window.location.hash;
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          get hash() {
            return originalHash;
          },
          set hash(v) {
            hashSpy(v);
          },
        },
        writable: true,
        configurable: true,
      });

      const { trigger, panel, profile } = refs();
      trigger.click();
      expect(panel.hasAttribute('hidden')).toBe(false);

      profile.click();

      expect(hashSpy).toHaveBeenCalledWith('#/configuracion/perfil');
      expect(panel.hasAttribute('hidden')).toBe(true);

      // Restore hash for subsequent tests.
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash: originalHash },
        writable: true,
        configurable: true,
      });
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  // Case 5: Cerrar sesión — awaits auth.logout, redirects, role flips; double-click is no-op.
  it('"Cerrar sesión" calls auth.logout() exactly once, redirects to #/login, and flips role to guest', async () => {
    vi.useFakeTimers();
    // Replace auth.logout with a stub that mirrors the real flow's
    // post-condition: fire _notifyAuthChange() so the registered
    // onAuthChange callback (from appShell.init) flips body[data-role].
    const logoutSpy = vi.spyOn(auth, 'logout').mockImplementation(async () => {
      auth._notifyAuthChange();
    });

    const { appShell, unsub } = await mountAsAdmin();
    try {
      // After logout, getUser() returns null → classifyRole(null) === 'guest'.
      vi.spyOn(auth, 'getUser').mockReturnValue(null);
      // Drain the auth-change microtask queue so the role flip completes
      // before we assert.

      const hashSpy = vi.fn();
      const originalHash = window.location.hash;
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          get hash() {
            return originalHash;
          },
          set hash(v) {
            hashSpy(v);
          },
        },
        writable: true,
        configurable: true,
      });

      const { trigger, panel, logout: logoutItem } = refs();
      trigger.click();
      expect(panel.hasAttribute('hidden')).toBe(false);

      logoutItem.click();

      // auth.logout was called once (the debounce blocks the second click inside 300ms).
      expect(logoutSpy).toHaveBeenCalledTimes(1);

      // Drain microtasks so the await auth.logout() resolves and the
      // auth-change callback finishes its async body.
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(hashSpy).toHaveBeenCalledWith('#/login');
      expect(document.body.dataset.role).toBe('guest');

      // Restore hash.
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hash: originalHash },
        writable: true,
        configurable: true,
      });
    } finally {
      vi.useRealTimers();
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('second click on "Cerrar sesión" during 300ms debounce window is a no-op', async () => {
    vi.useFakeTimers();
    const logoutSpy = vi.spyOn(auth, 'logout').mockResolvedValue(undefined);

    const { appShell, unsub } = await mountAsAdmin();
    try {
      const { trigger, logout: logoutItem } = refs();
      trigger.click();
      logoutItem.click();
      logoutItem.click(); // second click during debounce
      logoutItem.click(); // third click during debounce

      expect(logoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  // Case 6: Outside-click closes; destroy() removes listeners.
  it('clicking outside the trigger and panel closes an open panel', async () => {
    const { appShell, unsub } = await mountAsAdmin();
    try {
      const { trigger, panel } = refs();
      trigger.click();
      expect(panel.hasAttribute('hidden')).toBe(false);

      // Dispatch a click outside the trigger/panel subtree.
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(panel.hasAttribute('hidden')).toBe(true);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('destroy() removes the document click listener (subsequent outside-click does not throw)', async () => {
    const { appShell, unsub } = await mountAsAdmin();
    const { trigger, panel } = refs();
    trigger.click();
    expect(panel.hasAttribute('hidden')).toBe(false);

    appShell.destroy();
    if (typeof unsub === 'function') unsub();

    // After destroy, outside click must not throw and must not flip the
    // (already-closed) panel back open.
    expect(() => {
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }).not.toThrow();
    expect(panel.hasAttribute('hidden')).toBe(true);
  });

  // Case 7: A11y attributes — aria-haspopup, aria-expanded, role="menu", 2 menuitems.
  it('exposes WAI-ARIA menu-button attributes on trigger and panel', async () => {
    const { appShell, unsub } = await mountAsAdmin();
    try {
      const { trigger, panel } = refs();
      expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');

      expect(panel.getAttribute('role')).toBe('menu');

      const items = panel.querySelectorAll('[role="menuitem"]');
      expect(items.length).toBe(2);
      expect(items[0].textContent.trim()).toBe('Mi perfil');
      expect(items[1].textContent.trim()).toBe('Cerrar sesión');
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  // Case 9: No console errors during the dropdown flow.
  it('does not log console.error during the full open → close flow', async () => {
    const { appShell, unsub } = await mountAsAdmin();
    try {
      const { trigger, panel, logout: logoutItem } = refs();
      vi.spyOn(auth, 'logout').mockResolvedValue(undefined);
      trigger.click(); // open
      expect(panel.hasAttribute('hidden')).toBe(false);
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ); // close via Escape
      trigger.click(); // open again
      logoutItem.click(); // logout
      await Promise.resolve(); // drain await

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });
});

/**
 * Citizen user-menu dropdown — mirrors the admin menu but uses a compact
 * trigger (just the avatar, no name + chevron). The behavioural contract
 * is the same: aria-haspopup, click to open, Escape to close, "Mi perfil"
 * navigates, "Cerrar sesión" calls auth.logout() with a 300ms debounce.
 */
describe('citizen user-menu dropdown', () => {
  let consoleErrorSpy;

  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.replaceChildren(
      Object.assign(document.createElement('div'), {
        id: 'shell-outlet',
      }),
    );
    document.body.removeAttribute('data-role');
    vi.stubGlobal('fetch', mockFetchTemplate());
    // Citizen user — triggers the citizen header chrome.
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 7,
      first_name: 'Carla',
      email: 'carla@ciudadana.test',
      role: { id: 5, name: 'usuario' },
    });
    vi.spyOn(auth, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  async function mountAsCitizen() {
    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();
    return { appShell, unsub };
  }

  function citizenRefs() {
    return {
      trigger: document.getElementById('app-shell-citizen-menu-trigger'),
      panel: document.getElementById('app-shell-citizen-menu-panel'),
      profile: document.getElementById('app-shell-citizen-menu-profile'),
      logout: document.getElementById('app-shell-citizen-menu-logout'),
    };
  }

  it('renders the compact trigger and a hidden 2-item panel', async () => {
    const { appShell, unsub } = await mountAsCitizen();
    try {
      const { trigger, panel } = citizenRefs();
      expect(trigger).toBeTruthy();
      expect(
        trigger.classList.contains('app-shell-user-menu__trigger--avatar'),
      ).toBe(true);
      expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(panel.hasAttribute('hidden')).toBe(true);

      const items = panel.querySelectorAll('[role="menuitem"]');
      expect(items.length).toBe(2);
      expect(items[0].textContent.trim()).toBe('Mi perfil');
      expect(items[1].textContent.trim()).toBe('Cerrar sesión');
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('opens on trigger click and closes on Escape', async () => {
    const { appShell, unsub } = await mountAsCitizen();
    try {
      const { trigger, panel } = citizenRefs();
      trigger.click();
      expect(panel.hasAttribute('hidden')).toBe(false);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(panel.hasAttribute('hidden')).toBe(true);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('"Cerrar sesión" calls auth.logout() once and debounces rapid clicks', async () => {
    vi.useFakeTimers();
    const logoutSpy = vi.spyOn(auth, 'logout').mockResolvedValue(undefined);

    const { appShell, unsub } = await mountAsCitizen();
    try {
      const { trigger, logout } = citizenRefs();
      trigger.click();
      logout.click();
      logout.click();
      logout.click();

      expect(logoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('destroy() removes the citizen menu listeners (outside-click is a no-op)', async () => {
    const { appShell, unsub } = await mountAsCitizen();
    const { trigger, panel } = citizenRefs();
    trigger.click();
    expect(panel.hasAttribute('hidden')).toBe(false);

    appShell.destroy();
    if (typeof unsub === 'function') unsub();

    expect(() => {
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }).not.toThrow();
    expect(panel.hasAttribute('hidden')).toBe(true);
  });

  it('keeps the admin and citizen menus independent (opening one does not affect the other)', async () => {
    // The admin menu and citizen menu live in different DOM subtrees;
    // opening the admin trigger must not close or interfere with the
    // citizen trigger and vice versa.
    const { appShell, unsub } = await mountAsCitizen();
    try {
      const admin = {
        trigger: document.getElementById('app-shell-user-menu-trigger'),
        panel: document.getElementById('app-shell-user-menu-panel'),
      };
      const citizen = {
        trigger: document.getElementById('app-shell-citizen-menu-trigger'),
        panel: document.getElementById('app-shell-citizen-menu-panel'),
      };

      // Open admin — citizen panel must remain hidden.
      admin.trigger.click();
      expect(admin.panel.hasAttribute('hidden')).toBe(false);
      expect(citizen.panel.hasAttribute('hidden')).toBe(true);

      // Open citizen — admin panel must remain open (no global close).
      citizen.trigger.click();
      expect(admin.panel.hasAttribute('hidden')).toBe(false);
      expect(citizen.panel.hasAttribute('hidden')).toBe(false);
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });
});

/**
 * `classifyRole` — 5-role → 3-bucket mapping (T-2.3 / T-2.4 of
 * menu-server-driven PR 2).
 *
 * Design Decision 6 (frontend): classifyRole() must collapse all five
 * operational roles into the `admin` bucket, keep `usuario` in the
 * `citizen` bucket, and return `guest` for unauthenticated users. The
 * test reads the role list from OPERATIONAL_ROLES (the single source of
 * truth) so adding a new role to the operational bucket automatically
 * extends the test coverage — preventing the bucket from drifting out
 * of sync with role.js.
 */
describe('appShell — classifyRole (T-2.3 menu-server-driven)', () => {
  let classifyRole;

  beforeAll(async () => {
    const mod = await import('./app-shell.component.js');
    classifyRole = mod.classifyRole;
  });

  it.each([
    ['admin_sistema', 'admin'],
    ['admin_organizacion', 'admin'],
    ['operador_sistema', 'admin'],
    ['operador_organizacion', 'admin'],
    ['publicador', 'admin'],
  ])('classifies %s as %s', (roleName, expected) => {
    expect(classifyRole({ role: { id: 0, name: roleName } })).toBe(expected);
  });

  it('classifies every role listed in OPERATIONAL_ROLES as admin', () => {
    // Triangulation: when a new role is added to OPERATIONAL_ROLES,
    // classifyRole MUST include it in the admin bucket without further
    // code changes. This is the contract pinned by the design.
    for (const name of OPERATIONAL_ROLES) {
      expect(classifyRole({ role: { id: 0, name } })).toBe('admin');
    }
  });

  it('classifies "usuario" as citizen', () => {
    expect(classifyRole({ role: { id: 5, name: 'usuario' } })).toBe('citizen');
  });

  it('classifies a plain-string role payload the same as an object payload', () => {
    // resolveRoleName accepts both shapes; classifyRole must not break
    // when the backend returns either.
    expect(classifyRole({ role: 'usuario' })).toBe('citizen');
    expect(classifyRole({ role: 'operador_sistema' })).toBe('admin');
  });

  it.each([null, undefined])('classifies %p as guest', (input) => {
    expect(classifyRole(input)).toBe('guest');
  });

  it('classifies a user with no resolvable role as guest', () => {
    // user is present but role cannot be resolved (malformed payload).
    expect(classifyRole({})).toBe('guest');
    expect(classifyRole({ role: { id: 99 } })).toBe('guest');
  });

  it('does NOT bucket an unrecognised role into admin', () => {
    // Future-proofing: a new role that nobody added to OPERATIONAL_ROLES
    // must NOT silently land in the admin bucket — that's how the
    // original bug surfaced (operador_sistema fell into citizen).
    expect(classifyRole({ role: { name: 'some_future_role' } })).toBe('guest');
  });
});

/**
 * `renderSidebarMenu` — universal renderer across both sidebars (T-2.5 /
 * T-2.6 of menu-server-driven PR 2).
 *
 * Design Decision 6 (frontend): the renderer must work for ANY
 * authenticated user. It picks the target `<ul>` from `body[data-role]`:
 *   - admin    → `#app-shell-admin-menu-list`
 *   - citizen  → `#app-shell-citizen-menu-list` (added by T-2.7 HTML)
 *   - guest    → renderer is not invoked
 *
 * The renderer is private to the module — these tests exercise it
 * through `appShell.init()` and assert against the DOM, which is the
 * user-visible contract. `menuService.getMyMenu` is spied per-test to
 * pin the input; `notificationService` is spied so the header badge
 * fetch doesn't interfere with the renderer flow.
 */
describe('appShell — renderSidebarMenu (T-2.5 menu-server-driven)', () => {
  let getMyMenuSpy;
  let unreadCountSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren(
      Object.assign(document.createElement('div'), {
        id: 'shell-outlet',
      }),
    );
    document.body.removeAttribute('data-role');
    vi.stubGlobal('fetch', mockFetchTemplate());
    // The admin header bell fires notificationService.unreadCount() during
    // populateHeader(); return 0 so the badge is a no-op and the renderer
    // can run without unresolved promises hanging the test.
    unreadCountSpy = vi
      .spyOn(notificationService, 'unreadCount')
      .mockResolvedValue(0);
  });

  afterEach(() => {
    getMyMenuSpy?.mockRestore();
    unreadCountSpy?.mockRestore();
    vi.unstubAllGlobals();
  });

  it('renders a 3-leaf menu into #app-shell-citizen-menu-list for the citizen role', async () => {
    const citizenMenu = [
      {
        id: 16,
        parent_id: null,
        name: 'Inicio',
        route: '/feed',
        icon: 'house',
        children: [],
      },
      {
        id: 17,
        parent_id: null,
        name: 'Reportar',
        route: '/feed/crear',
        icon: 'circle-plus',
        children: [],
      },
      {
        id: 18,
        parent_id: null,
        name: 'Perfil',
        route: '/configuracion/perfil',
        icon: 'user',
        children: [],
      },
    ];
    getMyMenuSpy = vi
      .spyOn(menuService, 'getMyMenu')
      .mockResolvedValue(citizenMenu);
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 7,
      first_name: 'Carla',
      role: { id: 5, name: 'usuario' },
    });
    vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    expect(document.body.dataset.role).toBe('citizen');
    // Wait for the renderer's async chain to settle.
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();

    const citizenList = document.getElementById('app-shell-citizen-menu-list');
    expect(citizenList).toBeTruthy();
    const anchors = citizenList.querySelectorAll('a.app-shell-nav-item');
    expect(anchors.length).toBe(3);
    expect(anchors[0].getAttribute('href')).toBe('#/feed');
    expect(anchors[0].dataset.route).toBe('/feed');
    expect(anchors[0].querySelector('span').textContent).toBe('Inicio');
    expect(anchors[1].dataset.route).toBe('/feed/crear');
    expect(anchors[2].dataset.route).toBe('/configuracion/perfil');

    // T-2.2: icon-className assertions (R1.4, RX.2)
    expect(anchors[0].querySelector('i').className).toBe('fa-solid fa-house');
    expect(anchors[1].querySelector('i').className).toBe(
      'fa-solid fa-circle-plus',
    );
    expect(anchors[2].querySelector('i').className).toBe('fa-solid fa-user');

    // Admin sidebar must NOT be touched when the citizen renderer runs.
    const adminList = document.getElementById('app-shell-admin-menu-list');
    expect(adminList.children.length).toBe(0);

    if (typeof unsub === 'function') unsub();
  });

  it('renders a 3-leaf menu into #app-shell-admin-menu-list for the admin role', async () => {
    const adminMenu = [
      {
        id: 1,
        parent_id: null,
        name: 'Dashboard',
        route: '/dashboard',
        icon: 'gauge-high',
        children: [],
      },
      {
        id: 2,
        parent_id: null,
        name: 'Incidencias',
        route: '/incidencias',
        icon: 'list',
        children: [],
      },
      {
        id: 4,
        parent_id: null,
        name: 'Nueva Incidencia',
        route: '/incidencias/crear',
        icon: 'circle-plus',
        children: [],
      },
    ];
    getMyMenuSpy = vi
      .spyOn(menuService, 'getMyMenu')
      .mockResolvedValue(adminMenu);
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 1,
      first_name: 'Maria',
      last_name: 'Gonzalez',
      role: { id: 1, name: 'admin_sistema' },
    });
    vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    expect(document.body.dataset.role).toBe('admin');
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();

    const adminList = document.getElementById('app-shell-admin-menu-list');
    const anchors = adminList.querySelectorAll('a.app-shell-nav-item');
    expect(anchors.length).toBe(3);
    expect(anchors[0].dataset.route).toBe('/dashboard');
    expect(anchors[1].dataset.route).toBe('/incidencias');
    expect(anchors[2].dataset.route).toBe('/incidencias/crear');

    // T-2.2: icon-className assertions (R1.4, RX.2)
    expect(anchors[0].querySelector('i').className).toBe(
      'fa-solid fa-gauge-high',
    );
    expect(anchors[1].querySelector('i').className).toBe('fa-solid fa-list');
    expect(anchors[2].querySelector('i').className).toBe(
      'fa-solid fa-circle-plus',
    );

    // Citizen sidebar must NOT be touched when the admin renderer runs.
    const citizenList = document.getElementById('app-shell-citizen-menu-list');
    expect(citizenList.children.length).toBe(0);

    if (typeof unsub === 'function') unsub();
  });

  it('renders section headers for nodes with children (admin bucket)', async () => {
    const adminMenu = [
      {
        id: 1,
        parent_id: null,
        name: 'Incidencias',
        route: null,
        icon: null,
        children: [
          {
            id: 2,
            parent_id: 1,
            name: 'Lista',
            route: '/incidencias',
            icon: 'list',
            children: [],
          },
          {
            id: 4,
            parent_id: 1,
            name: 'Nueva',
            route: '/incidencias/crear',
            icon: 'circle-plus',
            children: [],
          },
        ],
      },
    ];
    getMyMenuSpy = vi
      .spyOn(menuService, 'getMyMenu')
      .mockResolvedValue(adminMenu);
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 1,
      first_name: 'Maria',
      role: { id: 1, name: 'admin_sistema' },
    });
    vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();

    const adminList = document.getElementById('app-shell-admin-menu-list');
    // Section header is an <li class="app-shell-section"> with an
    // uppercase <span> as the label.
    const section = adminList.querySelector('li.app-shell-section');
    expect(section).toBeTruthy();
    expect(section.querySelector('span').textContent).toBe('INCIDENCIAS');
    // Both child leaves are rendered as <a> elements.
    const leaves = adminList.querySelectorAll('a.app-shell-nav-item');
    expect(leaves.length).toBe(2);
    expect(leaves[0].dataset.route).toBe('/incidencias');
    expect(leaves[1].dataset.route).toBe('/incidencias/crear');

    // T-2.2: icon-className assertions for section children (R1.4, RX.2)
    expect(leaves[0].querySelector('i').className).toBe('fa-solid fa-list');
    expect(leaves[1].querySelector('i').className).toBe(
      'fa-solid fa-circle-plus',
    );

    if (typeof unsub === 'function') unsub();
  });

  it('leaves the citizen ul empty when /menus/my returns [] (citizen role)', async () => {
    getMyMenuSpy = vi.spyOn(menuService, 'getMyMenu').mockResolvedValue([]);
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 7,
      first_name: 'Carla',
      role: { id: 5, name: 'usuario' },
    });
    vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();

    const citizenList = document.getElementById('app-shell-citizen-menu-list');
    expect(citizenList).toBeTruthy();
    expect(citizenList.children.length).toBe(0);
    // No <a> elements at all — empty payload must not crash and must not
    // leave stale hardcoded items.
    expect(citizenList.querySelectorAll('a').length).toBe(0);

    if (typeof unsub === 'function') unsub();
  });

  it('does NOT invoke the renderer for the guest role', async () => {
    const getMyMenuSpyForGuest = vi.spyOn(menuService, 'getMyMenu');
    vi.spyOn(auth, 'getUser').mockReturnValue(null);
    vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    expect(document.body.dataset.role).toBe('guest');
    // Drain any microtasks just in case.
    await new Promise((r) => setTimeout(r, 0));

    expect(getMyMenuSpyForGuest).not.toHaveBeenCalled();
    const adminList = document.getElementById('app-shell-admin-menu-list');
    const citizenList = document.getElementById('app-shell-citizen-menu-list');
    expect(adminList.children.length).toBe(0);
    expect(citizenList.children.length).toBe(0);

    if (typeof unsub === 'function') unsub();
    getMyMenuSpyForGuest.mockRestore();
  });
});

/**
 * T-2.3: renderBottomNavMenu test scenarios (R3.3, R3.4, R3.5 / S3.1-S3.6)
 * These tests verify the bottom-nav is hydrated from /api/menus/my
 * with dual-whitelist logic (ADMIN_FULL / ADMIN_LIMITED / CITIZEN).
 */
describe.skip('renderBottomNavMenu (T-2.3)', () => {
  let getMyMenuSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren(
      Object.assign(document.createElement('div'), {
        id: 'shell-outlet',
      }),
    );
    document.body.removeAttribute('data-role');
    vi.stubGlobal('fetch', mockFetchTemplate());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (getMyMenuSpy) getMyMenuSpy.mockRestore();
  });

  it('admin with dashboard.view renders 4 items in bottom-nav (S3.1)', async () => {
    // Admin with full permissions: dashboard.view + incidents.view + incidents.manage + profile.view
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 1,
      first_name: 'Admin',
      last_name: 'User',
      email: 'admin@example.com',
      role: { id: 1, name: 'admin_sistema' },
    });
    // Simulate admin with /incidencias/crear in tree (has incidents.manage)
    const adminMenu = [
      {
        id: 1,
        parent_id: null,
        name: 'Dashboard',
        route: '/dashboard',
        icon: 'gauge-high',
        children: [],
      },
      {
        id: 2,
        parent_id: null,
        name: 'Incidencias',
        route: '/incidencias',
        icon: 'list',
        children: [],
      },
      {
        id: 4,
        parent_id: null,
        name: 'Nueva Incidencia',
        route: '/incidencias/crear',
        icon: 'circle-plus',
        children: [],
      },
      {
        id: 18,
        parent_id: null,
        name: 'Perfil',
        route: '/configuracion/perfil',
        icon: 'user',
        children: [],
      },
    ];
    getMyMenuSpy = vi
      .spyOn(menuService, 'getMyMenu')
      .mockResolvedValue(adminMenu);

    // Create the outlet element
    const bottomNav = document.createElement('nav');
    bottomNav.className = 'app-shell-bottom-nav';
    const ul = document.createElement('ul');
    ul.id = 'app-shell-bottom-nav-list';
    ul.className = 'app-shell-bottom-nav-list';
    bottomNav.appendChild(ul);
    document.body.appendChild(bottomNav);

    const { appShell } = await import('./app-shell.component.js');
    // Call renderBottomNavMenu directly if exported, otherwise test via init()
    await appShell.mount();
    const unsub = await appShell.init();

    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();

    const anchors = ul.querySelectorAll('a.app-shell-nav-item');
    expect(anchors.length).toBe(4);
    expect(anchors[0].dataset.route).toBe('/dashboard');
    expect(anchors[1].dataset.route).toBe('/incidencias');
    expect(anchors[2].dataset.route).toBe('/incidencias/crear');
    expect(anchors[3].dataset.route).toBe('/configuracion/perfil');

    // Verify icon classes
    expect(anchors[0].querySelector('i').className).toBe(
      'fa-solid fa-gauge-high',
    );
    expect(anchors[1].querySelector('i').className).toBe('fa-solid fa-list');
    expect(anchors[2].querySelector('i').className).toBe(
      'fa-solid fa-circle-plus',
    );
    expect(anchors[3].querySelector('i').className).toBe('fa-solid fa-user');

    // S3.6: /incidencias/crear should have __create class
    expect(anchors[2].classList.contains('app-shell-bottom-nav__create')).toBe(
      true,
    );

    bottomNav.remove();
    if (typeof unsub === 'function') unsub();
  });

  it('operador_organizacion (dashboard.view, no incidents.manage) renders 3 items (S3.2)', async () => {
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 2,
      first_name: 'Operador',
      last_name: 'Org',
      email: 'operador@example.com',
      role: { id: 4, name: 'operador_organizacion' },
    });
    const limitedMenu = [
      {
        id: 1,
        parent_id: null,
        name: 'Dashboard',
        route: '/operator/dashboard',
        icon: 'gauge-high',
        children: [],
      },
      {
        id: 2,
        parent_id: null,
        name: 'Lista',
        route: '/incidencias',
        icon: 'list',
        children: [],
      },
      {
        id: 18,
        parent_id: null,
        name: 'Perfil',
        route: '/configuracion/perfil',
        icon: 'user',
        children: [],
      },
    ];
    getMyMenuSpy = vi
      .spyOn(menuService, 'getMyMenu')
      .mockResolvedValue(limitedMenu);

    const bottomNav = document.createElement('nav');
    bottomNav.className = 'app-shell-bottom-nav';
    const ul = document.createElement('ul');
    ul.id = 'app-shell-bottom-nav-list';
    ul.className = 'app-shell-bottom-nav-list';
    bottomNav.appendChild(ul);
    document.body.appendChild(bottomNav);

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();

    const anchors = ul.querySelectorAll('a.app-shell-nav-item');
    expect(anchors.length).toBe(3);
    expect(anchors[0].dataset.route).toBe('/operator/dashboard');
    expect(anchors[1].dataset.route).toBe('/incidencias');
    expect(anchors[2].dataset.route).toBe('/configuracion/perfil');

    expect(ul.querySelector('[data-route="/dashboard"]')).toBeNull();
    expect(ul.querySelector('[data-route="/incidencias/crear"]')).toBeNull();

    bottomNav.remove();
    if (typeof unsub === 'function') unsub();
  });

  it('citizen (usuario) renders 2 nav items + synthesized "+" <li> at index 1 (S3.3, S3.5, Cleanup)', async () => {
    // Cleanup: the "+" plus button used to be a hardcoded sibling of the
    // <ul>, which placed it at the trailing slot 3/3 because the <ul> has
    // display: contents. The renderer now synthesizes it inside the <ul>
    // at index 1, restoring the original centered slot 2/3.
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 5,
      first_name: 'Usuario',
      last_name: 'Ciudadano',
      email: 'usuario@example.com',
      role: { id: 5, name: 'usuario' },
    });
    const citizenMenu = [
      {
        id: 16,
        parent_id: null,
        name: 'Inicio',
        route: '/feed',
        icon: 'house',
        children: [],
      },
      {
        id: 18,
        parent_id: null,
        name: 'Perfil',
        route: '/configuracion/perfil',
        icon: 'user',
        children: [],
      },
    ];
    getMyMenuSpy = vi
      .spyOn(menuService, 'getMyMenu')
      .mockResolvedValue(citizenMenu);

    const bottomNav = document.createElement('nav');
    bottomNav.className = 'app-shell-bottom-nav';
    // Citizen outlet — the renderer now synthesizes the "+" <li> inside
    // this <ul>; we deliberately do NOT pre-create a sibling <a>.
    const ul = document.createElement('ul');
    ul.id = 'app-shell-citizen-bottom-nav-list';
    ul.className = 'app-shell-citizen-bottom-nav-list';
    bottomNav.appendChild(ul);
    document.body.appendChild(bottomNav);

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();

    // Three <li> children now: Feed, "+", Perfil (in that order).
    const items = ul.querySelectorAll(':scope > li');
    expect(items.length).toBe(3);
    expect(items[0].querySelector('a').dataset.route).toBe('/feed');
    expect(items[2].querySelector('a').dataset.route).toBe(
      '/configuracion/perfil',
    );

    // The middle <li> is the synthesized "+" — it carries the same
    // contract the hardcoded one used to: a single <a> with the right
    // classes, id, aria-label, and circle-plus icon.
    const plusA = items[1].querySelector('a');
    expect(plusA).toBeTruthy();
    expect(plusA.classList.contains('app-shell-nav-item')).toBe(true);
    expect(plusA.classList.contains('app-shell-bottom-nav__plus')).toBe(true);
    expect(plusA.id).toBe('app-shell-bottom-plus');
    expect(plusA.getAttribute('aria-label')).toBe('Reportar incidencia');
    expect(plusA.querySelector('i').className).toBe('fa-solid fa-circle-plus');

    // Exactly one #app-shell-bottom-plus in the test-created bottomNav —
    // the renderer must not duplicate it across re-renders.
    expect(bottomNav.querySelectorAll('#app-shell-bottom-plus').length).toBe(1);

    bottomNav.remove();
    if (typeof unsub === 'function') unsub();
  });

  it('empty tree renders 0 items, no crash (S3.4)', async () => {
    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 1,
      first_name: 'Admin',
      last_name: 'User',
      email: 'admin@example.com',
      role: { id: 1, name: 'admin_sistema' },
    });
    getMyMenuSpy = vi.spyOn(menuService, 'getMyMenu').mockResolvedValue([]);

    const bottomNav = document.createElement('nav');
    bottomNav.className = 'app-shell-bottom-nav';
    const ul = document.createElement('ul');
    ul.id = 'app-shell-bottom-nav-list';
    ul.className = 'app-shell-bottom-nav-list';
    bottomNav.appendChild(ul);
    document.body.appendChild(bottomNav);

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();

    const anchors = ul.querySelectorAll('a.app-shell-nav-item');
    expect(anchors.length).toBe(0);

    bottomNav.remove();
    if (typeof unsub === 'function') unsub();
  });

  it('guest role does NOT call renderBottomNavMenu (S3.4-guest)', async () => {
    document.body.dataset.role = 'guest';
    const getMyMenuSpyForGuest = vi.spyOn(menuService, 'getMyMenu');

    const bottomNav = document.createElement('nav');
    bottomNav.className = 'app-shell-bottom-nav';
    const adminUl = document.createElement('ul');
    adminUl.id = 'app-shell-bottom-nav-list';
    bottomNav.appendChild(adminUl);
    const citizenUl = document.createElement('ul');
    citizenUl.id = 'app-shell-citizen-bottom-nav-list';
    bottomNav.appendChild(citizenUl);
    document.body.appendChild(bottomNav);

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    await new Promise((r) => setTimeout(r, 0));

    expect(getMyMenuSpyForGuest).not.toHaveBeenCalled();
    expect(adminUl.children.length).toBe(0);
    expect(citizenUl.children.length).toBe(0);

    bottomNav.remove();
    if (typeof unsub === 'function') unsub();
    getMyMenuSpyForGuest.mockRestore();
  });
});

/**
 * Citizen notification bell — dropdown + SSE wiring (Phase 3, 33bd3210 +
 * debf56e0). Covers:
 *   - badge count updates when an SSE message arrives
 *   - dropdown open/close (trigger click, outside click, Escape)
 *   - graceful no-crash when EventSource is unsupported or errors
 *
 * A minimal `MockEventSource` stands in for the browser's native
 * EventSource — the codebase has no existing convention for this (SSE is
 * new in this phase), so the stub follows the same "assign directly on
 * `window`" pattern already used for `window.matchMedia` in the sidebar
 * toggle tests above, rather than introducing vi.stubGlobal for a class.
 */
describe('citizen notification bell — SSE + dropdown', () => {
  class MockEventSource {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.onmessage = null;
      this.onerror = null;
      this.listeners = new Map();
      this.closed = false;
      MockEventSource.instances.push(this);
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
    close() {
      this.closed = true;
    }
  }
  MockEventSource.instances = [];

  let consoleErrorSpy;
  let unreadCountSpy;
  let listSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.instances = [];
    document.body.replaceChildren(
      Object.assign(document.createElement('div'), {
        id: 'shell-outlet',
      }),
    );
    document.body.removeAttribute('data-role');
    vi.stubGlobal('fetch', mockFetchTemplate(TEMPLATE_HTML_WITH_BELL));
    window.EventSource = MockEventSource;

    vi.spyOn(auth, 'getUser').mockReturnValue({
      id: 9,
      first_name: 'Nico',
      email: 'nico@ciudadana.test',
      role: { id: 5, name: 'usuario' },
    });
    vi.spyOn(auth, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});
    unreadCountSpy = vi
      .spyOn(notificationService, 'unreadCount')
      .mockResolvedValue(0);
    listSpy = vi
      .spyOn(notificationService, 'list')
      .mockResolvedValue({ data: [], meta: null, unreadCount: 0 });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete window.EventSource;
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  async function mountCitizen() {
    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();
    return { appShell, unsub };
  }

  function bellRefs() {
    return {
      btn: document.getElementById('app-shell-bell'),
      panel: document.getElementById('app-shell-bell-panel'),
      list: document.getElementById('app-shell-bell-list'),
      badge: document.getElementById('app-shell-bell-badge'),
    };
  }

  it('opens an EventSource connection to the native SSE endpoint with withCredentials for the citizen role', async () => {
    const { appShell, unsub } = await mountCitizen();
    try {
      expect(MockEventSource.instances).toHaveLength(1);
      const instance = MockEventSource.instances[0];
      // After Fase 3 of openspec/changes/eliminar-mercure-sse-nativo,
      // the bell streams from /api/notifications/stream (Laravel
      // Octane/Swoole + Redis Pub/Sub). The `access_token` cookie
      // set at login authorizes the request server-side.
      expect(instance.url).toBe('/api/notifications/stream');
      expect(instance.options).toEqual({ withCredentials: true });
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('updates the bell badge when a named notification SSE event arrives', async () => {
    const { appShell, unsub } = await mountCitizen();
    try {
      const { badge } = bellRefs();
      expect(badge.classList.contains('d-none')).toBe(true);

      unreadCountSpy.mockResolvedValue(3);
      const instance = MockEventSource.instances[0];
      instance.listeners.get('notification')({
        data: JSON.stringify({
          id: 1,
          message: 'Nueva notificación',
          read: false,
          created_at: '2026-07-08T10:00:00Z',
        }),
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(badge.textContent).toBe('3');
      expect(badge.classList.contains('d-none')).toBe(false);
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('caps the badge display at "99+" for large unread counts', async () => {
    const { appShell, unsub } = await mountCitizen();
    try {
      const { badge } = bellRefs();
      unreadCountSpy.mockResolvedValue(150);
      const instance = MockEventSource.instances[0];
      instance.onmessage({
        data: JSON.stringify({ id: 2, message: 'x', read: false }),
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(badge.textContent).toBe('99+');
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('prepends the new notification into an already-open bell panel', async () => {
    const { appShell, unsub } = await mountCitizen();
    try {
      const { btn, list } = bellRefs();
      btn.click();
      await Promise.resolve();
      await Promise.resolve();
      expect(list.querySelector('#app-shell-bell-empty')).toBeTruthy();

      const instance = MockEventSource.instances[0];
      instance.onmessage({
        data: JSON.stringify({
          id: 3,
          message: 'Incidencia actualizada',
          read: false,
          created_at: '2026-07-08T10:05:00Z',
        }),
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(list.querySelector('#app-shell-bell-empty')).toBeFalsy();
      expect(list.children).toHaveLength(1);
      expect(list.textContent).toContain('Incidencia actualizada');
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('ignores a malformed SSE payload instead of crashing', async () => {
    const { appShell, unsub } = await mountCitizen();
    try {
      const instance = MockEventSource.instances[0];
      expect(() => instance.onmessage({ data: 'not-json{{{' })).not.toThrow();
      await Promise.resolve();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('opens the panel on trigger click and fetches the latest notifications', async () => {
    const { appShell, unsub } = await mountCitizen();
    try {
      const { btn, panel } = bellRefs();
      expect(panel.hasAttribute('hidden')).toBe(true);
      expect(btn.getAttribute('aria-expanded')).toBe('false');

      btn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(panel.hasAttribute('hidden')).toBe(false);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      expect(listSpy).toHaveBeenCalledWith({ page: 1, perPage: 8 });
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('closes the panel on a second trigger click', async () => {
    const { appShell, unsub } = await mountCitizen();
    try {
      const { btn, panel } = bellRefs();
      btn.click();
      await Promise.resolve();
      expect(panel.hasAttribute('hidden')).toBe(false);

      btn.click();
      expect(panel.hasAttribute('hidden')).toBe(true);
      expect(btn.getAttribute('aria-expanded')).toBe('false');
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('closes the panel on outside click', async () => {
    const { appShell, unsub } = await mountCitizen();
    try {
      const { btn, panel } = bellRefs();
      btn.click();
      await Promise.resolve();
      expect(panel.hasAttribute('hidden')).toBe(false);

      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(panel.hasAttribute('hidden')).toBe(true);
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('closes the panel when Escape is pressed', async () => {
    const { appShell, unsub } = await mountCitizen();
    try {
      const { btn, panel } = bellRefs();
      btn.click();
      await Promise.resolve();
      expect(panel.hasAttribute('hidden')).toBe(false);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );

      expect(panel.hasAttribute('hidden')).toBe(true);
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('does not crash init() when EventSource is unsupported, and does not open a connection', async () => {
    delete window.EventSource;

    const { appShell, unsub } = await mountCitizen();
    try {
      expect(MockEventSource.instances).toHaveLength(0);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      // The dropdown itself must keep working even without SSE.
      const { btn, panel } = bellRefs();
      btn.click();
      await Promise.resolve();
      expect(panel.hasAttribute('hidden')).toBe(false);
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('does not crash when the SSE connection errors, and closes the stream', async () => {
    const { appShell, unsub } = await mountCitizen();
    try {
      const instance = MockEventSource.instances[0];
      expect(() => instance.onerror()).not.toThrow();
      expect(instance.closed).toBe(true);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  it('destroy() closes the SSE stream and removes bell listeners (no crash on later outside-click)', async () => {
    const { appShell, unsub } = await mountCitizen();
    const instance = MockEventSource.instances[0];
    const { btn, panel } = bellRefs();
    btn.click();
    await Promise.resolve();
    expect(panel.hasAttribute('hidden')).toBe(false);

    appShell.destroy();
    if (typeof unsub === 'function') unsub();

    expect(instance.closed).toBe(true);
    expect(() => {
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────
// Pending-approval bell counter — WU-7 (admin-approval-notifications)
// Verifies the bell badge correctly reflects the pending-approval count
// filtered by the backend (scope: admin, type: incident_pending_approval).
// ────────────────────────────────────────────────────────────────────

/**
 * Admin bell markup fixture — mirrors the structure used in the citizen
 * bell tests (TEMPLATE_HTML_WITH_BELL) but for the admin header variant.
 * Both admin and citizen bell markup are always in the DOM; only one
 * is visible per role via CSS.
 */
const ADMIN_BELL_TEMPLATE = `
<div class="app-shell">
<header class="app-shell-header">
  <button type="button" class="app-shell-sidebar-toggle" id="app-shell-sidebar-toggle" aria-label="Alternar barra lateral" aria-expanded="true">
    <i class="fa-solid fa-angles-left"></i>
  </button>
  <div class="app-shell-header__admin" data-show-on-role="admin">
    <div class="app-shell-bell-wrapper">
      <button class="app-shell-header__bell" id="app-shell-bell-admin" type="button" aria-label="Notificaciones" aria-haspopup="true" aria-expanded="false" aria-controls="app-shell-bell-panel-admin">
        <i class="fa-regular fa-bell"></i>
        <span class="app-shell-header__notif-badge d-none" id="app-shell-bell-badge-admin">0</span>
      </button>
      <div class="app-shell-user-menu__panel app-shell-bell-panel" id="app-shell-bell-panel-admin" hidden>
        <div class="app-shell-bell-panel__header">Notificaciones</div>
        <ul class="app-shell-bell-panel__list" id="app-shell-bell-list-admin">
          <li class="app-shell-bell-panel__empty" id="app-shell-bell-empty-admin">Sin notificaciones</li>
        </ul>
      </div>
    </div>
    <div class="app-shell-user-menu">
      <button class="app-shell-user-menu__trigger" id="app-shell-user-menu-trigger" aria-haspopup="menu" aria-expanded="false">
        <span class="app-shell-user-menu__avatar" id="app-shell-user-avatar">A</span>
        <span class="app-shell-user-menu__name" id="app-shell-user-name">Admin</span>
      </button>
    </div>
  </div>
</header>
<aside class="app-shell-sidebar" id="app-shell-sidebar">
  <nav class="app-shell-sidebar__nav" id="app-shell-admin-sidebar" data-show-on-role="admin">
    <ul class="app-shell-sidebar__list" id="app-shell-admin-menu-list"></ul>
  </nav>
</aside>
<main class="app-shell-main">
  <div id="page-outlet"></div>
</main>
<nav class="app-shell-bottom-nav">
  <ul id="app-shell-bottom-nav-list" class="app-shell-bottom-nav-list"></ul>
</nav>
</div>
`;

describe('appShell — pending-approval bell counter (WU-7)', () => {
  class MockEventSource {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.onmessage = null;
      this.onerror = null;
      this.listeners = new Map();
      this.closed = false;
      MockEventSource.instances.push(this);
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
    close() {
      this.closed = true;
    }
  }
  MockEventSource.instances = [];

  let consoleErrorSpy;
  let unreadCountSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.instances = [];
    document.body.replaceChildren(
      Object.assign(document.createElement('div'), {
        id: 'shell-outlet',
      }),
    );
    document.body.removeAttribute('data-role');
    vi.stubGlobal('fetch', mockFetchTemplate(ADMIN_BELL_TEMPLATE));
    window.EventSource = MockEventSource;

    const adminUser = {
      id: 1,
      first_name: 'Admin',
      last_name: 'User',
      email: 'admin@example.com',
      role: { id: 1, name: 'admin_sistema' },
    };
    vi.spyOn(auth, 'me').mockResolvedValue(adminUser);
    vi.spyOn(auth, 'getUser').mockReturnValue(adminUser);
    vi.spyOn(auth, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});
    vi.spyOn(menuService, 'getMyMenu').mockResolvedValue([]);
    unreadCountSpy = vi
      .spyOn(notificationService, 'unreadCount')
      .mockResolvedValue(0);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete window.EventSource;
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  async function mountAdmin() {
    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();
    return { appShell, unsub };
  }

  function adminBellRefs() {
    return {
      btn: document.getElementById('app-shell-bell-admin'),
      panel: document.getElementById('app-shell-bell-panel-admin'),
      list: document.getElementById('app-shell-bell-list-admin'),
      badge: document.getElementById('app-shell-bell-badge-admin'),
    };
  }

  /**
   * WU-7 AC-1: Counter initial value comes from /notifications/unread-count.
   * The backend filters this endpoint by scope (admin) and type (incident_pending_approval),
   * so the initial badge value is the pending-approval count — not the total unread count.
   *
   * Note: mock must be set BEFORE mountAdmin() because populateHeader() calls
   * updateBadge() synchronously during init().
   */
  it('renders the initial pending-approval counter from the unread-count endpoint', async () => {
    unreadCountSpy.mockResolvedValue(5);
    const { appShell, unsub } = await mountAdmin();
    try {
      const { badge } = adminBellRefs();

      // Wait for the unreadCount() promise triggered during init() to resolve.
      await vi.waitFor(() => expect(badge.textContent).toBe('5'), {
        timeout: 1000,
      });

      expect(badge.classList.contains('d-none')).toBe(false);
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  /**
   * WU-7 AC-2: SSE event for incident_pending_approval increments the counter.
   * When a new pending-approval notification arrives via SSE, the bell re-fetches
   * the unread count from the backend (which now includes this new notification
   * in its filtered count), causing the badge to update.
   */
  it('re-fetches the counter when an incident_pending_approval SSE event arrives', async () => {
    unreadCountSpy.mockResolvedValue(2);
    const { appShell, unsub } = await mountAdmin();
    try {
      const { badge } = adminBellRefs();

      // Wait for initial count to be set.
      await vi.waitFor(() => expect(badge.textContent).toBe('2'), {
        timeout: 1000,
      });

      // Simulate SSE event for a new pending approval notification.
      // Backend now has 3 pending approvals.
      unreadCountSpy.mockResolvedValue(3);
      const instance = MockEventSource.instances[0];
      instance.listeners.get('notification')({
        data: JSON.stringify({
          id: 99,
          type: 'incident_pending_approval',
          message: 'Nueva incidencia pendiente de aprobación',
          read: false,
          incident: { id: 42, title: 'Bache en Av. Principal' },
          created_at: '2026-07-28T12:00:00Z',
        }),
      });

      // Counter incremented to reflect the new pending approval.
      await vi.waitFor(() => expect(badge.textContent).toBe('3'), {
        timeout: 1000,
      });
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  /**
   * WU-7 AC-3: SSE event for non-pending notification types does NOT increment
   * the pending-approval counter. The bell still re-fetches from the backend,
   * but since the backend filters by incident_pending_approval, the count
   * returned is still the correct pending-approval count (unchanged).
   */
  it('does not increment the pending-approval counter when a non-pending SSE event arrives', async () => {
    unreadCountSpy.mockResolvedValue(3);
    const { appShell, unsub } = await mountAdmin();
    try {
      const { badge } = adminBellRefs();

      // Wait for initial count to be set.
      await vi.waitFor(() => expect(badge.textContent).toBe('3'), {
        timeout: 1000,
      });

      // Simulate SSE event for a comment notification (not a pending approval).
      // The backend still returns 3 because it filters by incident_pending_approval.
      unreadCountSpy.mockResolvedValue(3);
      const instance = MockEventSource.instances[0];
      instance.listeners.get('notification')({
        data: JSON.stringify({
          id: 100,
          type: 'comment',
          message: 'Nuevo comentario en tu incidencia',
          read: false,
          incident: { id: 5, title: 'Semáforo dañado' },
          created_at: '2026-07-28T12:05:00Z',
        }),
      });

      // Counter unchanged — non-pending notifications don't affect the pending count.
      await vi.waitFor(() => expect(badge.textContent).toBe('3'), {
        timeout: 1000,
      });
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  /**
   * WU-7 AC-3 variant: SSE event for assignment type also does NOT increment
   * the pending-approval counter.
   */
  it('does not increment the pending-approval counter when an assignment SSE event arrives', async () => {
    unreadCountSpy.mockResolvedValue(4);
    const { appShell, unsub } = await mountAdmin();
    try {
      const { badge } = adminBellRefs();

      await vi.waitFor(() => expect(badge.textContent).toBe('4'), {
        timeout: 1000,
      });

      // SSE for assignment (not a pending approval).
      unreadCountSpy.mockResolvedValue(4);
      const instance = MockEventSource.instances[0];
      instance.listeners.get('notification')({
        data: JSON.stringify({
          id: 101,
          type: 'assignment',
          message: 'Incidencia asignada a tu organización',
          read: false,
          incident: { id: 8, title: 'Alumbrado público apagado' },
          created_at: '2026-07-28T12:10:00Z',
        }),
      });

      expect(badge.textContent).toBe('4');
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });

  /**
   * WU-7: counter resets to fresh backend value after page refresh (init).
   * Each time init() runs (e.g. after auth change), the bell re-fetches
   * the unread count, ensuring the displayed count is always accurate.
   */
  it('re-fetches the pending-approval count on init (auth change / page refresh)', async () => {
    unreadCountSpy.mockResolvedValue(1);
    const { appShell, unsub } = await mountAdmin();
    try {
      const { badge } = adminBellRefs();

      await vi.waitFor(() => expect(badge.textContent).toBe('1'), {
        timeout: 1000,
      });

      // Simulate auth change (page refresh / re-login).
      // The backend now has 6 pending approvals.
      unreadCountSpy.mockResolvedValue(6);
      // Trigger populateHeader again via auth change.
      const { appShell: shell2 } = await import('./app-shell.component.js');
      await shell2.init();
      await vi.waitFor(() => expect(badge.textContent).toBe('6'), {
        timeout: 1000,
      });

      shell2.destroy();
    } finally {
      appShell.destroy();
      if (typeof unsub === 'function') unsub();
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// populateHeader avatar rendering (C3)
// ────────────────────────────────────────────────────────────────────

describe('appShell — populateHeader avatar rendering (C3)', () => {
  /**
   * Set up the minimal DOM + fetch stub needed for mount().
   * The template includes admin and citizen avatar spans.
   */
  function setupShell(user) {
    document.body.replaceChildren(
      Object.assign(document.createElement('div'), {
        id: 'shell-outlet',
      }),
    );
    document.body.removeAttribute('data-role');

    vi.stubGlobal('fetch', mockFetchTemplate());

    vi.spyOn(auth, 'me').mockResolvedValue(user);
    vi.spyOn(auth, 'onAuthChange').mockImplementation(() => () => {});
    vi.spyOn(auth, 'getUser').mockReturnValue(null);
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValue(0);
    vi.spyOn(menuService, 'getMyMenu').mockResolvedValue([]);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders <img> in admin avatar span when user.profile_image_path is set', async () => {
    setupShell({
      id: 1,
      first_name: 'Ana',
      last_name: 'Admin',
      email: 'ana@example.com',
      profile_image_path: 'users/1/abc123.webp',
      role: { id: 1, name: 'admin_sistema' },
    });

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    const avatarEl = document.getElementById('app-shell-user-avatar');
    const img = avatarEl?.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.src).toContain('/storage/users/1/abc123.webp');
    expect(img.alt).toBe('avatar');

    if (typeof unsub === 'function') unsub();
  });

  it('renders <img> in citizen avatar span when user.profile_image_path is set', async () => {
    setupShell({
      id: 7,
      first_name: 'Carla',
      last_name: 'Ciudadana',
      email: 'carla@example.com',
      profile_image_path: 'users/7/def456.webp',
      role: { id: 5, name: 'usuario' },
    });

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    const avatarEl = document.getElementById('app-shell-avatar');
    const img = avatarEl?.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.src).toContain('/storage/users/7/def456.webp');
    expect(img.alt).toBe('avatar');

    if (typeof unsub === 'function') unsub();
  });

  it('falls back to the default avatar image when user has no profile_image_path (regression)', async () => {
    setupShell({
      id: 1,
      first_name: 'Ana',
      last_name: 'Admin',
      email: 'ana@example.com',
      profile_image_path: null,
      role: { id: 1, name: 'admin_sistema' },
    });

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    const avatarEl = document.getElementById('app-shell-user-avatar');
    const img = avatarEl?.querySelector('img');
    // No initials — the default avatar image is rendered instead
    expect(img).not.toBeNull();
    expect(img.src).toContain('/images/default-avatar.svg');

    if (typeof unsub === 'function') unsub();
  });

  it('prefers profile_image_path over avatar (Google legacy) object', async () => {
    // user has both profile_image_path (new) and avatar (Google) — profile_image_path wins
    const user = {
      id: 1,
      first_name: 'Ana',
      last_name: 'Admin',
      email: 'ana@example.com',
      profile_image_path: 'users/1/new.webp',
      avatar: { url: 'https://googleusercontent.com/old.jpg' },
      role: { id: 1, name: 'admin_sistema' },
    };
    // resolveAvatar(profile_image_path || avatar) should return the profile_image_path URL
    const resolved = resolveAvatar(user.profile_image_path || user.avatar);
    expect(resolved).toBe('users/1/new.webp');

    setupShell(user);

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    const avatarEl = document.getElementById('app-shell-user-avatar');
    const img = avatarEl?.querySelector('img');
    expect(img).not.toBeNull();
    // The component normalizes the path to /storage/ prefix
    expect(img.src).toContain('/storage/users/1/new.webp');

    if (typeof unsub === 'function') unsub();
  });
});
