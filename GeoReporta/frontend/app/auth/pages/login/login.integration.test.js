/**
 * login.integration.test.js — regression test for the role-bucket race
 * between auth.login() and router.resolve() (PR #2 of consolidar-layout-unico).
 *
 * Bug history:
 *   login.component.js used to call `window.location.hash = '#/feed'`
 *   right after `await auth.me()`, without telling the router about the
 *   user's role. The boot-time `syncCurrentUserRole()` in app.js runs
 *   fire-and-forget on `auth.onAuthChange`, so the router's
 *   `_currentUserRole` bucket was still 'guest' when resolve() ran the
 *   role-mismatch guard. Two failure modes:
 *
 *     - Citizen → /feed: the guard saw (citizen route, guest bucket) and
 *       called navigate('/feed'). Same hash, no `hashchange` event,
 *       resolve() returned without mounting → blank page.
 *     - Admin → /dashboard: the guard saw (admin route, guest bucket)
 *       and called navigate('/feed') (because guest !== admin → citizen
 *       home). User landed on the wrong shell.
 *
 * Fix:
 *   login.component.js now calls
 *     `router.setCurrentUserRole(classifyRole(user))`
 *   synchronously, with the user it just fetched from /me, BEFORE
 *   changing the hash. The bucket is correct when resolve() runs, so
 *   the guard does not fire and the page mounts.
 *
 * What this test guards against:
 *   A regression that re-introduces the race — e.g. someone "simplifies"
 *   the login flow and drops the explicit setCurrentUserRole call, or
 *   moves it after the hash assignment. The test asserts:
 *     1. setCurrentUserRole is called with the classified role.
 *     2. The bucket update happens WHILE the hash is still /login
 *        (proving it runs before the hash assignment).
 *     3. classifyRole is called with the user returned by /me.
 *     4. The citizen route (/feed) actually mounts into the shell.
 */

// Hoist the mock objects so `vi.mock` factories can close over them
// (vitest resolves hoisted references before evaluating the file body).
const layout = vi.hoisted(() => ({ initPage: vi.fn() }));
vi.mock('../../../utils/layout.js', () => layout);

const authMock = vi.hoisted(() => ({
  login: vi.fn(),
  me: vi.fn(),
  onAuthChange: vi.fn(() => () => {}),
  isAuthenticated: vi.fn(() => false),
  getUser: vi.fn(() => null),
}));
vi.mock('../../auth.service.js', () => ({ auth: authMock }));

const classifyRoleMock = vi.hoisted(() => vi.fn());
vi.mock('../../../app-shell/app-shell.component.js', () => ({
  classifyRole: classifyRoleMock,
}));

import { router } from '../../../core/router.js';
import loginComponent from './login.component.js';

function htmlResponse(body) {
  return { ok: true, status: 200, text: vi.fn().mockResolvedValue(body) };
}

// Minimal login template — must contain every id login.component.js
// queries in onInit.
const LOGIN_TEMPLATE = `
  <div class="preloader"></div>
  <form id="login-form">
    <input id="email" type="email" />
    <input id="password" type="password" />
    <div id="login-error" class="d-none"></div>
    <button type="submit">Iniciar Sesión</button>
  </form>
`;

const FEED_TEMPLATE = '<section id="feed-page">Feed</section>';
const FEED_CSS = '#feed-page { color: rebeccapurple; }';

describe('login flow — router role bucket race (regression)', () => {
  // We register a real `hashchange` listener on `window` so the
  // production-equivalent wiring (router.init adds one in app.js) is
  // exercised here. The listener is the same one router.init() uses:
  // a bound reference stored on the router instance, removed in
  // afterEach via router.destroy() so no test leak.
  beforeEach(() => {
    // Reset router state between tests (matches router.integration.test.js).
    router.routes = [];
    router.currentComponent = null;
    router.currentRoute = null;
    router._shellMounted = false;
    router.setCurrentUserRole(null);

    // DOM scaffolding required by router.resolve() and login.component.js.
    document.body.innerHTML = `
      <div id="main-wrapper">
        <div id="shell-outlet"><div id="page-outlet"></div></div>
      </div>
      <div id="auth-outlet"></div>
    `;

    // Register the single 'app' shell. Mount is called once by the
    // router; the page-outlet exists from the beforeEach DOM, so the
    // shell mount can be a no-op.
    router.setShell({
      mount: vi.fn().mockResolvedValue(undefined),
      init: vi.fn().mockResolvedValue(undefined),
      outlet: '#page-outlet',
      updateActive: vi.fn(),
    });

    // Wire the routes we care about (matches the real route table in
    // app.js for the login + citizen-home pair).
    router.addRoute('/login', loginComponent);
    router.addRoute(
      '/feed',
      {
        templateUrl: '/templates/feed.html',
        styleUrl: '/styles/feed.css',
        onInit: vi.fn(),
        onDestroy: vi.fn(),
      },
      [],
      'citizen',
    );

    // Stand up the production hashchange wiring so the test exercises
    // the same listener the router uses in app.js.
    router.init();

    // Mock fetch for login + feed templates.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        // Router appends ?raw=1 to .css URLs (Vite dev workaround — see
        // _withRaw in router.js). Parse the URL so the matcher is
        // independent of any query string.
        const u = new URL(url, 'http://x');
        const path = u.pathname;
        if (path.endsWith('login.component.html')) {
          return htmlResponse(LOGIN_TEMPLATE);
        }
        if (path.endsWith('login.component.css')) {
          return htmlResponse('/* login styles */');
        }
        if (path === '/templates/feed.html') {
          return htmlResponse(FEED_TEMPLATE);
        }
        if (path === '/styles/feed.css') {
          return htmlResponse(FEED_CSS);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    // Reset mocks so prior tests don't leak state.
    authMock.login.mockReset();
    authMock.me.mockReset();
    classifyRoleMock.mockReset();
  });

  afterEach(() => {
    // Tear down the hashchange listener registered in beforeEach so
    // it does not leak into the next test.
    router.destroy();
    vi.unstubAllGlobals();
  });

  it('sets the router role bucket synchronously before the hash change, so /feed mounts for a citizen', async () => {
    // Boot state: bucket = 'guest' (the value set by app.js when the
    // visitor lands on /login without a session). This is the EXACT
    // stale state that triggered the original bug.
    router.setCurrentUserRole('guest');

    // Emulate the production onAuthChange listener as a no-op: the
    // bucket must only be updated by login itself for this test to
    // isolate the bug surface. In production this listener is the
    // fire-and-forget `syncCurrentUserRole` that loses the race.
    authMock.onAuthChange.mockImplementation(() => () => {});

    authMock.login.mockResolvedValue({
      access_token: 'tok',
      session_id: 's',
    });
    authMock.me.mockResolvedValue({
      id: 1,
      email: 'citizen@example.com',
      first_name: 'Citizen',
      last_name: 'User',
      role: { name: 'usuario' },
    });
    classifyRoleMock.mockReturnValue('citizen');

    // Initial mount of the /login route so its onInit wires the submit
    // handler. Set the hash FIRST so router.init()'s implicit resolve
    // picks it up instead of bouncing through '/' → navigate('/login').
    window.location.hash = '#/login';
    // router.init() already ran in beforeEach and registered the
    // hashchange listener. The assignment above just fired it once,
    // so wait for the form to be in the DOM rather than re-resolving.
    await vi.waitFor(() => {
      expect(document.getElementById('login-form')).toBeTruthy();
    });

    // Spy on setCurrentUserRole AFTER the login route is mounted so we
    // only observe the login flow's own bucket updates (not the boot
    // bucket-set we did explicitly above).
    const events = [];
    const originalSetRole = router.setCurrentUserRole.bind(router);
    router.setCurrentUserRole = vi.fn((role) => {
      // window.location.hash is read synchronously here, so the
      // recorded hash is the hash AT THE TIME of the setRole call —
      // i.e. before the login flow assigns '#/feed' to the hash.
      events.push({ type: 'setRole', role, hash: window.location.hash });
      originalSetRole(role);
    });

    // Trigger the form submit. The handler is async; the hashchange
    // listener registered by router.init() will pick up the resulting
    // hash change and call resolve() for /feed.
    const form = document.getElementById('login-form');
    document.getElementById('email').value = 'citizen@example.com';
    document.getElementById('password').value = 'pw';
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );

    // Wait for the login flow to navigate to /feed AND for the page
    // to actually mount. Both must hold; a missing mount means the
    // race re-introduced the blank-page bug.
    await vi.waitFor(
      () => {
        expect(window.location.hash).toBe('#/feed');
        expect(document.getElementById('page-outlet').innerHTML).toContain(
          'Feed',
        );
      },
      { timeout: 2000 },
    );

    // Assertion 1 — the bucket was updated with the classified role.
    const setRoleEvent = events.find((e) => e.type === 'setRole');
    expect(setRoleEvent).toBeDefined();
    expect(setRoleEvent.role).toBe('citizen');

    // Assertion 2 — the bucket update happened BEFORE the hash change.
    // If someone moves setCurrentUserRole after the hash assignment,
    // this fails because the recorded hash would be '#/feed'.
    expect(setRoleEvent.hash).toBe('#/login');

    // Assertion 3 — classifyRole was called with the user from /me.
    expect(classifyRoleMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: { name: 'usuario' } }),
    );

    // Assertion 4 — the bucket is now 'citizen' (the user-facing state
    // after a successful login).
    expect(router._currentUserRole).toBe('citizen');
  });
});
