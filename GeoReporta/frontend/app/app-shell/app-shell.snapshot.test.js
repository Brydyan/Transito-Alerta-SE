/**
 * appShell visual regression snapshot tests (T-3.8).
 *
 * Pins the DOM structure of the unified appShell across three role
 * modes (admin, citizen, guest) and across a live role-switch event.
 *
 * These snapshots are the visual contract: any change to the rendered
 * chrome (header, sidebar, bottom nav) MUST be reflected here on
 * purpose, not by accident. jsdom can't render CSS, but it can verify
 * that the correct DOM tree is in place — which is what determines
 * whether the role-specific regions show up.
 *
 * The snapshot uses the real production template loaded via the
 * fixture template path so changes to app-shell.component.html are
 * caught immediately.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, 'app-shell.component.html');

/**
 * Read the real production template. This is intentional — the
 * snapshot test must lock the actual production DOM, not a test-only
 * mock. If the template changes shape, the snapshot test fails loudly
 * and forces the developer to update both the code and the snapshot.
 */
const PRODUCTION_TEMPLATE = readFileSync(TEMPLATE_PATH, 'utf8');

function htmlResponse(body) {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(body),
  };
}

function mockFetchTemplate(templateHtml = PRODUCTION_TEMPLATE) {
  return vi.fn(async (url) => {
    if (url.includes('app-shell.component.html')) {
      return htmlResponse(templateHtml);
    }
    return htmlResponse('');
  });
}

/**
 * Strip HTML comments and collapse inter-tag whitespace so the snapshot
 * is stable across jsdom's normalization choices. The structural
 * shape (tags + attributes + text content) is what the contract pins.
 */
function normalizeForSnapshot(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('appShell visual regression snapshots (T-3.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `<div id="shell-outlet"></div>`;
    document.body.removeAttribute('data-role');
    vi.stubGlobal('fetch', mockFetchTemplate());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('admin-mode renders the full chrome (header + admin sidebar + admin bottom nav)', async () => {
    const { auth } = await import('../auth/auth.service.js');
    const adminUser = {
      id: 1,
      first_name: 'Admin',
      last_name: 'Root',
      email: 'admin@georeporta.test',
      role: { id: 1, name: 'admin_sistema' },
    };
    const getUserSpy = vi.spyOn(auth, 'getUser').mockReturnValue(adminUser);
    vi.spyOn(auth, 'me').mockResolvedValue(adminUser);
    vi.spyOn(auth, 'isAuthenticated').mockReturnValue(true);

    const { appShell } = await import('./app-shell.component.js');

    await appShell.mount();
    const unsub = await appShell.init();

    expect(document.body.dataset.role).toBe('admin');

    const outletHtml = document.getElementById('shell-outlet').innerHTML;
    const normalized = normalizeForSnapshot(outletHtml);

    expect(normalized).toMatchSnapshot();

    if (typeof unsub === 'function') unsub();
    getUserSpy.mockRestore();
  });

  it('citizen-mode renders citizen chrome (bell + avatar header + citizen sidebar + plus button)', async () => {
    const { auth } = await import('../auth/auth.service.js');
    const { menuService } = await import('../shared/menu.service.js');
    const { notificationService } =
      await import('../shared/notification.service.js');
    const citizenUser = {
      id: 7,
      first_name: 'Carla',
      email: 'carla@ciudadana.test',
      role: { id: 5, name: 'usuario' },
    };
    vi.spyOn(auth, 'getUser').mockReturnValue(citizenUser);
    vi.spyOn(auth, 'me').mockResolvedValue(citizenUser);
    vi.spyOn(auth, 'isAuthenticated').mockReturnValue(true);
    // The "+" plus button is now synthesized inside the citizen <ul> by
    // renderBottomNavMenu. Stub the menu service so the renderer returns
    // a deterministic citizen tree (Inicio + Perfil — Reportar is dropped
    // because the CITIZEN whitelist only includes /feed and /profile).
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
        id: 18,
        parent_id: null,
        name: 'Perfil',
        route: '/configuracion/perfil',
        icon: 'user',
        children: [],
      },
    ]);
    vi.spyOn(notificationService, 'unreadCount').mockResolvedValue(0);

    const { appShell } = await import('./app-shell.component.js');

    await appShell.mount();
    const unsub = await appShell.init();

    // Drain the renderer's async chain before asserting DOM state.
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();

    expect(document.body.dataset.role).toBe('citizen');

    // Citizen-specific regions present.
    expect(document.getElementById('app-shell-bell')).toBeTruthy();
    expect(document.getElementById('app-shell-avatar')).toBeTruthy();
    expect(document.getElementById('app-shell-citizen-sidebar')).toBeTruthy();

    // Admin regions still in DOM but tagged for hiding via CSS.
    const adminSidebar = document.getElementById('app-shell-admin-sidebar');
    expect(adminSidebar).toBeTruthy();
    expect(adminSidebar.dataset.showOnRole).toBe('admin');

    // Citizen avatar was populated from auth.getUser() — no photo, so the
    // default avatar image is rendered (not a letter badge).
    const citizenAvatar = document.getElementById('app-shell-avatar');
    const citizenAvatarImg = citizenAvatar?.querySelector('img');
    expect(citizenAvatarImg).not.toBeNull();
    expect(citizenAvatarImg.src).toContain('/images/default-avatar.svg');

    // Pin the rendered HTML shape too — citizen differs from admin only by
    // which populated DOM regions, but the chrome itself is identical.
    const outletHtml = document.getElementById('shell-outlet').innerHTML;
    const normalized = normalizeForSnapshot(outletHtml);
    expect(normalized).toMatchSnapshot('citizen-mode');

    if (typeof unsub === 'function') unsub();
  });

  it('guest-mode shows the login button (no auth)', async () => {
    const { auth } = await import('../auth/auth.service.js');
    vi.spyOn(auth, 'getUser').mockReturnValue(null);
    vi.spyOn(auth, 'me').mockResolvedValue(null);
    vi.spyOn(auth, 'isAuthenticated').mockReturnValue(false);

    const { appShell } = await import('./app-shell.component.js');

    await appShell.mount();
    const unsub = await appShell.init();

    expect(document.body.dataset.role).toBe('guest');
    const loginBtn = document.getElementById('app-shell-login-btn');
    expect(loginBtn).toBeTruthy();
    expect(loginBtn.getAttribute('href')).toBe('#/login');

    const outletHtml = document.getElementById('shell-outlet').innerHTML;
    const normalized = normalizeForSnapshot(outletHtml);
    expect(normalized).toMatchSnapshot('guest-mode');

    if (typeof unsub === 'function') unsub();
  });

  it('role switching via auth change callback toggles body[data-role] correctly', async () => {
    const { auth } = await import('../auth/auth.service.js');
    const getUserSpy = vi.spyOn(auth, 'getUser');
    // `me()` is called once on init and once per auth-change callback.
    // Chain mockResolvedValueOnce to match each getUserSpy state in order.
    const meSpy = vi.spyOn(auth, 'me');

    // Start as admin.
    const adminUser = {
      id: 1,
      first_name: 'Admin',
      role: { id: 1, name: 'admin_sistema' },
    };
    getUserSpy.mockReturnValue(adminUser);
    meSpy.mockResolvedValueOnce(adminUser);

    const { appShell } = await import('./app-shell.component.js');
    await appShell.mount();
    const unsub = await appShell.init();

    expect(document.body.dataset.role).toBe('admin');

    // The appShell registered a callback with auth.onAuthChange during
    // init(). Trigger it by simulating auth state transitions.
    if (Array.isArray(auth._authChangeCallbacks)) {
      // Switch to citizen.
      const citizenUser = {
        id: 2,
        first_name: 'Ciudadana',
        role: { id: 5, name: 'usuario' },
      };
      getUserSpy.mockReturnValue(citizenUser);
      meSpy.mockResolvedValueOnce(citizenUser);
      // Wait for async callbacks to settle.
      await Promise.all(auth._authChangeCallbacks.map((cb) => cb()));
      expect(document.body.dataset.role).toBe('citizen');

      // Switch to guest (logout).
      getUserSpy.mockReturnValue(null);
      meSpy.mockResolvedValueOnce(null);
      await Promise.all(auth._authChangeCallbacks.map((cb) => cb()));
      expect(document.body.dataset.role).toBe('guest');
    } else {
      throw new Error(
        'auth._authChangeCallbacks not exposed — cannot simulate auth change',
      );
    }

    if (typeof unsub === 'function') unsub();
  });
});
