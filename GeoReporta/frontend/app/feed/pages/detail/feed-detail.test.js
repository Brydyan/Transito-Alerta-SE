/**
 * feed-detail component unit tests — role-aware back-link (T-3.7).
 *
 * After PR #3 of consolidar-layout-unico, the back-to-feed link is
 * driven by `router.currentRoute?.role` rather than a DOM probe of
 * `#main-wrapper.layout-hidden`. These tests pin the new contract:
 *   - citizen role: back-link href = #/feed
 *   - admin role:   back-link href = #/incidencias/feed
 *   - source file does NOT reference the legacy DOM-probe selectors
 *
 * The DOM probe was deleted along with the adminShell. The role tag
 * on the matched route is now the single source of truth.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentPath = join(__dirname, 'feed-detail.component.js');
const componentSource = readFileSync(componentPath, 'utf8');

const { router } = await import('../../../core/router.js');

function htmlResponse(body) {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(body),
  };
}

function setupBackLinkDom() {
  document.body.innerHTML = `
    <div id="fd-loading"></div>
    <div id="fd-empty" class="d-none"></div>
    <div id="fd-error" class="d-none"></div>
    <div id="fd-detail" class="d-none">
      <div id="fd-header-content"></div>
      <div id="fd-description"></div>
      <div id="fd-meta"></div>
      <div id="fd-map"></div>
    </div>
    <a class="fd-back-feed" href="#/feed"></a>
    <a class="fd-back-feed" href="#/feed"></a>
  `;
}

describe('feed-detail — role-aware back-link (T-3.7)', () => {
  let feedDetailModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    setupBackLinkDom();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (
          url.includes('feed-detail.component.html') ||
          url.includes('feed-detail.component.css')
        ) {
          return htmlResponse('');
        }
        return htmlResponse('');
      }),
    );

    feedDetailModule = await import('./feed-detail.component.js');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    router.currentRoute = null;
  });

  it('exports a defineComponent contract', () => {
    const component = feedDetailModule.default;
    expect(component).toHaveProperty('template');
    expect(component).toHaveProperty('style');
    expect(component).toHaveProperty('onInit');
    expect(component).toHaveProperty('onDestroy');
  });

  it('sets the back-link href to #/feed when router.currentRoute.role === "citizen"', async () => {
    router.currentRoute = { role: 'citizen' };

    const component = feedDetailModule.default;
    await component.onInit();

    const backLinks = document.querySelectorAll('.fd-back-feed');
    expect(backLinks.length).toBeGreaterThan(0);
    backLinks.forEach((link) => {
      expect(link.getAttribute('href')).toBe('#/feed');
    });

    component.onDestroy();
  });

  it('sets the back-link href to #/incidencias/feed when router.currentRoute.role === "admin"', async () => {
    router.currentRoute = { role: 'admin' };

    const component = feedDetailModule.default;
    await component.onInit();

    const backLinks = document.querySelectorAll('.fd-back-feed');
    expect(backLinks.length).toBeGreaterThan(0);
    backLinks.forEach((link) => {
      expect(link.getAttribute('href')).toBe('#/incidencias/feed');
    });

    component.onDestroy();
  });

  it('falls back to #/feed when router.currentRoute is unavailable', async () => {
    router.currentRoute = null;

    const component = feedDetailModule.default;
    await component.onInit();

    const backLinks = document.querySelectorAll('.fd-back-feed');
    backLinks.forEach((link) => {
      expect(link.getAttribute('href')).toBe('#/feed');
    });

    component.onDestroy();
  });

  it('source file no longer references the legacy DOM-probe selectors', () => {
    expect(componentSource).not.toMatch(/isAdminContext/);
    expect(componentSource).not.toMatch(/main-wrapper/);
    expect(componentSource).not.toMatch(/layout-hidden/);
  });
});
