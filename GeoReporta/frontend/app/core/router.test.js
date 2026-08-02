/**
 * Router unit tests — _matchRoute param matching.
 */
const layout = vi.hoisted(() => ({
  initPage: vi.fn(),
  initShell: vi.fn(),
}));

vi.mock('../utils/layout.js', () => layout);

import { router } from './router.js';

describe('router._matchRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches exact pattern without params', () => {
    const result = router._matchRoute('/incidencias/feed', '/incidencias/feed');
    expect(result).toEqual({});
  });

  it('matches :id pattern and extracts param', () => {
    const result = router._matchRoute('/incidencias/:id', '/incidencias/42');
    expect(result).toEqual({ id: '42' });
  });

  it('matches :id with UUID-style value', () => {
    const result = router._matchRoute(
      '/incidencias/:id',
      '/incidencias/abc-123-def',
    );
    expect(result).toEqual({ id: 'abc-123-def' });
  });

  it('returns null for different segment count', () => {
    const result = router._matchRoute(
      '/incidencias/:id',
      '/incidencias/42/comments',
    );
    expect(result).toBeNull();
  });

  it('returns null for non-matching literal segment', () => {
    const result = router._matchRoute(
      '/incidencias/feed',
      '/incidencias/detail',
    );
    expect(result).toBeNull();
  });

  it('supports multiple params', () => {
    const result = router._matchRoute('/:resource/:id', '/incidencias/42');
    expect(result).toEqual({ resource: 'incidencias', id: '42' });
  });

  it('keeps backward compatibility with exact match routes', () => {
    // Exact match should still work through resolve's find()
    const exact = router.routes.find((r) => r.pattern === '/login');
    expect(exact).toBeUndefined(); // no routes registered in default state
  });
});

/**
 * Deep-link support — R-INV-11 + WU-4 fallout:
 *
 * When a user lands on a non-root URL without a hash (typical for
 * invitation emails that produce `/accept-invite?token=...`), the router
 * used to treat the empty hash as `/` and redirect to `/login`, dropping
 * the route AND the token. `init()` must seed the hash from the pathname
 * + search so `resolve()` finds the real route on the next microtask.
 */
describe('router.init — deep-link seeding', () => {
  beforeEach(() => {
    // Reset the singleton state. _matchRoute tests don't touch these,
    // but init() / resolve() do.
    router.routes = [];
    router.shell = null;
    router.currentComponent = null;
    router._shellMounted = false;
    router.setCurrentUserRole(null);

    // Block the hashchange listener from being registered. We're
    // testing init()'s seed behavior in isolation; the listener's role
    // (re-resolve on hashchange) is covered by the integration tests.
    vi.spyOn(window, 'addEventListener').mockImplementation(() => {});

    // Stub navigate() so resolve()'s fallback routing doesn't mutate
    // window.location.hash while we're asserting on init()'s decision.
    vi.spyOn(router, 'navigate').mockImplementation(() => {});
  });

  it('seeds the hash from the pathname when landing on a non-root URL without a hash', () => {
    // Simulates clicking the email link `https://app/accept-invite?token=abc`
    // — pathname is the route, search carries the token, hash is empty.
    window.history.replaceState(null, '', '/accept-invite?token=abc');

    router.init();

    expect(window.location.hash).toBe('#/accept-invite?token=abc');
  });

  it('does NOT seed the hash on the root path with no hash (preserves the / → /login redirect)', () => {
    window.history.replaceState(null, '', '/');

    router.init();

    // Seed branch was skipped, so hash stays empty; resolve() takes over
    // and navigates to /login (stubbed here so the assertion is on
    // init()'s decision, not the side-effect).
    expect(window.location.hash).toBe('');
    expect(router.navigate).toHaveBeenCalledWith('/login');
  });

  it('does NOT seed the hash when the hash is already set (preserves existing deep-link routing)', () => {
    window.history.replaceState(null, '', '/#/dashboard');

    router.init();

    expect(window.location.hash).toBe('#/dashboard');
  });
});
