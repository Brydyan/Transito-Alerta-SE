/**
 * Router integration test — single-shell, simplified API.
 *
 * Verifies:
 *   1. A route tagged with a shell mounts inside that shell's outlet, fetches
 *      its template + style, wires updateActive on
 *      the shell, and calls onInit / initPage exactly once.
 *   2. A role-mismatch (citizen accessing an admin-tagged route) redirects
 *      to /feed and skips onInit.
 *   3. A full-page route (no shell) renders into #auth-outlet; toggling back
 *      to a shell route clears #auth-outlet and re-renders into the page
 *      outlet WITHOUT re-mounting the shell (the shell is mounted once).
 */
const layout = vi.hoisted(() => ({
  initPage: vi.fn(),
}));

vi.mock('../utils/layout.js', () => layout);

import { router } from './router.js';

function htmlResponse(body) {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(body),
  };
}

describe('router integration (single-shell)', () => {
  let fetchMock;
  let shellMount;
  let shellInit;

  beforeEach(() => {
    router.routes = [];
    router.currentComponent = null;
    router.currentRoute = null;
    router._shellMounted = false;
    router.setCurrentUserRole(null);
    layout.initPage.mockClear();

    document.body.innerHTML = `
      <div id="main-wrapper">
        <div id="shell-outlet"></div>
      </div>
      <div id="auth-outlet"></div>
      <ul id="sidebarnav">
        <li class="sidebar-item">
          <a class="sidebar-link" href="#/dashboard">Dashboard</a>
        </li>
      </ul>
    `;

    shellMount = vi.fn().mockResolvedValue(undefined);
    shellInit = vi.fn().mockResolvedValue(undefined);
    router.setShell({
      mount: shellMount,
      init: shellInit,
      outlet: '#page-outlet',
      styleUrl: null,
      updateActive(path) {
        document.querySelectorAll('#sidebarnav .sidebar-item').forEach((li) => {
          const a = li.querySelector(':scope > a.sidebar-link');
          if (!a) return;
          const active = a.getAttribute('href') === `#${path}`;
          li.classList.toggle('selected', active);
          a.classList.toggle('active', active);
        });
      },
    });

    // Inject the page-outlet that the shell would normally create.
    document.querySelector('#shell-outlet').innerHTML =
      '<div id="page-outlet"></div>';

    window.location.hash = '#/dashboard';
    fetchMock = vi.fn(async (url) => {
      // The router appends ?raw=1 to CSS URLs (Vite dev workaround — see
      // _withRaw in router.js). Treat ?raw=1 URLs as the same resource.
      const u = new URL(url, 'http://x');
      const path = u.pathname;
      if (path === '/templates/dashboard.html') {
        return htmlResponse('<section id="dashboard-page">Dashboard</section>');
      }
      if (path === '/styles/dashboard.css') {
        return htmlResponse('#dashboard-page { color: rebeccapurple; }');
      }
      if (path === '/templates/login.html') {
        return htmlResponse('<form id="login-form"></form>');
      }
      if (path === '/styles/login.css') {
        return htmlResponse('/* */');
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts a route inside the shell, with one fetch each + one onInit', async () => {
    const onInit = vi.fn();
    const onDestroy = vi.fn();

    router.addRoute(
      '/dashboard',
      {
        templateUrl: '/templates/dashboard.html',
        styleUrl: '/styles/dashboard.css',
        onInit,
        onDestroy,
      },
      [],
      'admin',
    );

    await router.resolve();

    expect(shellMount).toHaveBeenCalledTimes(1);
    expect(shellInit).toHaveBeenCalledTimes(1);
    expect(layout.initPage).toHaveBeenCalledTimes(1);
    expect(onInit).toHaveBeenCalledTimes(1);
    expect(document.getElementById('page-outlet').innerHTML).toContain(
      'Dashboard',
    );
    expect(document.getElementById('auth-outlet').innerHTML).toBe('');
    expect(
      document.querySelector('.sidebar-link')?.classList.contains('active'),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/templates/dashboard.html');
    // The router appends ?raw=1 to .css URLs (see _withRaw in router.js)
    // so Vite's dev HMR wrapper doesn't corrupt the CSS parser.
    expect(fetchMock).toHaveBeenCalledWith('/styles/dashboard.css?raw=1');
  });

  it('mounts bundled template + style strings with zero fetches', async () => {
    const onInit = vi.fn();

    // Components migrated to Vite ?raw imports expose `template`/`style`
    // strings instead of `templateUrl`/`styleUrl` — the router must mount
    // them without touching the network. Same for the shell's `style`.
    router.shell.style = '#sidebarnav { padding: 0; }';
    router.addRoute(
      '/dashboard',
      {
        template: '<section id="dashboard-page">Inline</section>',
        style: '#dashboard-page { color: teal; }',
        onInit,
      },
      [],
      'admin',
    );

    await router.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById('page-outlet').innerHTML).toContain(
      'Inline',
    );
    expect(document.getElementById('shell-style')).not.toBeNull();
    const styles = [...document.querySelectorAll('style[id^="style-"]')];
    expect(styles.some((s) => s.textContent.includes('teal'))).toBe(true);
    expect(onInit).toHaveBeenCalledTimes(1);
  });

  it('lets an admin bucket into a citizen-tagged route (backend menu grants Inicio/Reportar by permission)', async () => {
    const onInit = vi.fn();

    router.setCurrentUserRole('admin');
    router.addRoute(
      '/dashboard',
      {
        template: '<section id="dashboard-page">Feed</section>',
        onInit,
      },
      [],
      'citizen',
    );

    await router.resolve();

    expect(onInit).toHaveBeenCalledTimes(1);
    expect(document.getElementById('page-outlet').innerHTML).toContain('Feed');
  });

  it('lets any bucket into a both-tagged route (e.g. /configuracion/perfil)', async () => {
    const onInit = vi.fn();

    router.setCurrentUserRole('admin');
    router.addRoute(
      '/dashboard',
      {
        template: '<section id="dashboard-page">Perfil</section>',
        onInit,
      },
      [],
      'both',
    );

    await router.resolve();

    expect(onInit).toHaveBeenCalledTimes(1);
    expect(document.getElementById('page-outlet').innerHTML).toContain(
      'Perfil',
    );
  });

  it('redirects to /feed when a citizen accesses an admin-tagged route', async () => {
    const onInit = vi.fn();

    router.setCurrentUserRole('citizen');
    router.addRoute(
      '/dashboard',
      {
        templateUrl: '/templates/dashboard.html',
        styleUrl: '/styles/dashboard.css',
        onInit,
      },
      [],
      'admin',
    );

    await router.resolve();

    expect(window.location.hash).toBe('#/feed');
    expect(onInit).not.toHaveBeenCalled();
  });

  it('swaps auth-outlet <-> page-outlet without re-mounting the shell', async () => {
    const dashboardOnInit = vi.fn();
    router.addRoute(
      '/dashboard',
      {
        templateUrl: '/templates/dashboard.html',
        styleUrl: '/styles/dashboard.css',
        onInit: dashboardOnInit,
        onDestroy: vi.fn(),
      },
      [],
      'admin',
    );
    router.addRoute('/login', {
      templateUrl: '/templates/login.html',
      styleUrl: '/styles/login.css',
      onInit: vi.fn(),
      onDestroy: vi.fn(),
    });

    // 1. Shell route first
    window.location.hash = '#/dashboard';
    await router.resolve();
    expect(shellMount).toHaveBeenCalledTimes(1);
    expect(dashboardOnInit).toHaveBeenCalledTimes(1);

    // 2. Navigate to /login (full-page)
    window.location.hash = '#/login';
    await router.resolve();
    expect(document.getElementById('auth-outlet').innerHTML).toContain('login');
    expect(document.getElementById('auth-outlet').style.display).toBe('block');
    expect(document.getElementById('page-outlet').innerHTML).toContain(
      'Dashboard',
    ); // shell content preserved

    // 3. Back to a shell route — shell.mount is NOT called again
    window.location.hash = '#/dashboard';
    await router.resolve();
    expect(shellMount).toHaveBeenCalledTimes(1); // unchanged
    expect(dashboardOnInit).toHaveBeenCalledTimes(2);
    expect(document.getElementById('auth-outlet').innerHTML).toBe('');
    expect(document.getElementById('auth-outlet').style.display).toBe('none');
    expect(document.getElementById('page-outlet').innerHTML).toContain(
      'Dashboard',
    );
  });
});
