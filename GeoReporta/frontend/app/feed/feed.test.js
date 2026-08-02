/**
 * Feed component unit tests — single responsive template contract.
 *
 * The feed component renders a single #feed element with .feed-main and
 * .feed-aside children. It no longer probes #main-wrapper or toggles
 * #feed-desktop/#feed-mobile containers — viewport reflow is handled
 * by CSS grid + media query.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const feedModule = await import('./feed.component.js');
const feedComponent = feedModule.default;

function htmlResponse(body) {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(body),
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const feedHtmlPath = join(__dirname, 'feed.component.html');
const feedJsPath = join(__dirname, 'feed.component.js');
const feedHtml = readFileSync(feedHtmlPath, 'utf8');
const feedJs = readFileSync(feedJsPath, 'utf8');

describe('feed component — single responsive template', () => {
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();

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
      if (url.includes('feed.component.html')) {
        return htmlResponse('<div id="feed" class="feed"></div>');
      }
      return htmlResponse('');
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('component exports defineComponent contract', () => {
    expect(feedComponent).toHaveProperty('template');
    expect(feedComponent).toHaveProperty('style');
    expect(feedComponent).toHaveProperty('onInit');
    expect(feedComponent).toHaveProperty('onDestroy');
    // Bundled at build time via Vite ?raw imports — real file contents,
    // not URLs, so the router mounts without any runtime fetch.
    expect(feedComponent.template).toContain('<');
    expect(feedComponent.style).toBeTruthy();
  });

  it('onInit handles missing DOM gracefully', async () => {
    document.body.innerHTML = '';

    await expect(feedComponent.onInit()).resolves.toBeUndefined();
    feedComponent.onDestroy();
  });

  it('template has exactly one #feed container (no dual desktop/mobile split)', () => {
    expect((feedHtml.match(/id="feed"/g) || []).length).toBe(1);
    expect(feedHtml).not.toMatch(/id="feed-desktop"/);
    expect(feedHtml).not.toMatch(/id="feed-mobile"/);
    expect(feedHtml).not.toMatch(/id="feed-list-mobile"/);
    expect(feedHtml).not.toMatch(/id="feed-sentinel-mobile"/);
    expect(feedHtml).not.toMatch(/id="feed-cargando-mobile"/);
    expect(feedHtml).not.toMatch(/id="feed-vacio-mobile"/);
  });

  it('template uses Bootstrap row layout (col-lg-8 main + col-lg-4 aside) under #feed', () => {
    expect(feedHtml).toMatch(/id="feed"[^>]*class="row"/);
    expect(feedHtml).toMatch(/<div class="col-12 col-lg-8">/);
    expect(feedHtml).toMatch(/class="col-12 col-lg-4/);
  });

  it('component does not probe #main-wrapper for context detection', () => {
    expect(feedJs).not.toMatch(/main-wrapper/);
    expect(feedJs).not.toMatch(/detectContext/);
    expect(feedJs).not.toMatch(/feed-list-mobile/);
    expect(feedJs).not.toMatch(/feed-sentinel-mobile/);
    expect(feedJs).not.toMatch(/feed-cargando-mobile/);
    expect(feedJs).not.toMatch(/feed-vacio-mobile/);
  });
});
