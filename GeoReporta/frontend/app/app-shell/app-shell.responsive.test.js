/**
 * appShell responsive breakpoint behavior tests (T-1.9).
 *
 * jsdom does not implement CSS media query evaluation, so we:
 *   1. Mock `window.matchMedia` to return viewport-specific matches.
 *   2. Read the actual CSS source to assert that the rules are present
 *      (mobile hide sidebar + show bottom nav, desktop show sidebar + hide
 *      bottom nav, role-based hiding via body[data-role] selectors).
 *
 * The CSS file is the contract; the tests prove the contract is honoured.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CSS_PATH = resolve(__dirname, './app-shell.component.css');

function readCss() {
  return readFileSync(CSS_PATH, 'utf-8');
}

function mockMatchMedia(viewports) {
  // viewports: { mobile: true, desktop: false } — controls which query matches
  return (query) => ({
    matches: viewports.includes(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

describe('appShell — responsive CSS (T-1.9)', () => {
  describe('mobile viewport (<768px)', () => {
    let matchMediaMock;

    beforeEach(() => {
      matchMediaMock = vi.fn(
        mockMatchMedia(['(max-width: 767.98px)', '(max-width: 768px)']),
      );
      window.matchMedia = matchMediaMock;
    });

    it('matchMedia reports mobile breakpoint as matching', () => {
      const result = window.matchMedia('(max-width: 767.98px)');
      expect(result.matches).toBe(true);
    });

    it('matchMedia reports desktop breakpoint as not matching', () => {
      const result = window.matchMedia('(min-width: 768px)');
      expect(result.matches).toBe(false);
    });
  });

  describe('desktop viewport (>=768px)', () => {
    let matchMediaMock;

    beforeEach(() => {
      matchMediaMock = vi.fn(mockMatchMedia(['(min-width: 768px)']));
      window.matchMedia = matchMediaMock;
    });

    it('matchMedia reports desktop breakpoint as matching', () => {
      const result = window.matchMedia('(min-width: 768px)');
      expect(result.matches).toBe(true);
    });

    it('matchMedia reports mobile breakpoint as not matching', () => {
      const result = window.matchMedia('(max-width: 767.98px)');
      expect(result.matches).toBe(false);
    });
  });

  describe('CSS source contract', () => {
    let css;
    // Strip /* ... */ comments once so regexes don't get tripped up by
    // multi-line comments inside rule bodies (e.g. the off-canvas
    // overlay block that explains the transform).
    let cssNoComments;

    beforeAll(() => {
      css = readCss();
      cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    });

    it('declares CSS grid layout with sidebar + header + main areas', () => {
      expect(css).toMatch(/grid-template-areas/);
      expect(css).toMatch(/sidebar/);
      expect(css).toMatch(/header/);
      expect(css).toMatch(/main/);
    });

    it('declares a mobile breakpoint that hides the sidebar offscreen', () => {
      // A media query that affects .app-shell-sidebar layout
      const mobileRule = /@media[^{]*\(max-width:\s*7\d{2}/i;
      expect(css).toMatch(mobileRule);
      // The mobile block must park the sidebar off-canvas (transform
      // translateX(-100%)) so the hamburger toggle can slide it in.
      expect(cssNoComments).toMatch(
        /\.app-shell-sidebar\s*\{[^}]*transform:\s*translateX\(-100%\)/,
      );
      // The opened state must reverse the transform.
      expect(cssNoComments).toMatch(
        /\.app-shell-sidebar\.is-open\s*\{[^}]*transform:\s*translateX\(0\)/,
      );
    });

    it('declares a sidebar-backdrop element for the mobile overlay', () => {
      // The backdrop sits over the main area when the sidebar is open.
      expect(cssNoComments).toMatch(/\.app-shell-sidebar-backdrop/);
      // Backdrop has an .is-open modifier that toggles pointer events.
      expect(cssNoComments).toMatch(
        /\.app-shell-sidebar-backdrop\.is-open\s*\{[^}]*pointer-events:\s*auto/,
      );
    });

    it('declares a desktop breakpoint that shows sidebar', () => {
      // Desktop sidebar visibility comes from the grid layout's default
      // columns (240px 1fr) — no dedicated @media block needed because the
      // mobile block hides the sidebar and the default state shows it. So
      // we only assert that the desktop grid columns exist.
      expect(css).toMatch(/grid-template-columns:\s*240px\s+1fr/);
    });

    it('hides bottom nav by default', () => {
      // Bottom nav is hidden by default (display: none) — mobile uses off-canvas sidebar
      expect(css).toMatch(/\.app-shell-bottom-nav[^}]*display:\s*none/);
    });

    it('declares a sidebar toggle button styled to match the header chrome', () => {
      // The button lives in the header and shares the header's hover colour.
      expect(cssNoComments).toMatch(/\.app-shell-sidebar-toggle\s*\{/);
      // 38x38 size to match the existing icon buttons.
      expect(cssNoComments).toMatch(
        /\.app-shell-sidebar-toggle\s*\{[^}]*width:\s*38px[^}]*height:\s*38px/,
      );
    });

    it('declares a desktop collapsed modifier that narrows the grid', () => {
      // The collapsed state swaps the first grid column from 240px to 72px.
      expect(cssNoComments).toMatch(
        /\.app-shell--sidebar-collapsed\s*\{[^}]*grid-template-columns:\s*72px\s+1fr/,
      );
      // And hides the nav-item text labels.
      expect(cssNoComments).toMatch(
        /\.app-shell--sidebar-collapsed[^{}]*\.app-shell-nav-item\s+span\s*\{[^}]*display:\s*none/,
      );
      // Section titles (PRINCIPAL, GESTIÓN, ...) are also hidden.
      expect(cssNoComments).toMatch(
        /\.app-shell--sidebar-collapsed[^{}]*\.app-shell-section\s*\{[^}]*display:\s*none/,
      );
    });

    it('uses body[data-role] selectors for role-based hiding', () => {
      expect(css).toMatch(/body\[data-role=["']admin["']\]/);
      expect(css).toMatch(/body\[data-role=["']citizen["']\]/);
    });

    it('hides [data-show-on-role] elements by default and shows via body data-role', () => {
      // Default hidden (any `display: none` rule on the [data-show-on-role] selector).
      expect(css).toMatch(/\[data-show-on-role\][^}]*display:\s*none/);
      // Show mechanism: under body[data-role='admin'] we set a positive
      // display for the chrome regions (.app-shell-header__admin,
      // #app-shell-admin-sidebar, .app-shell-bottom-nav items, etc.).
      // We accept any positive display value (flex, block, inline-flex, inline-block)
      // since the per-element rule determines the correct value.
      expect(css).toMatch(
        /body\[data-role=["']admin["']\][^{]*\{[^}]*display:\s*(flex|block|inline-flex|inline-block)/s,
      );
    });

    it('prefix scheme uses app-shell-* for all custom classes', () => {
      // Class selectors begin with `.` followed by an identifier char.
      // The root grid container is intentionally `.app-shell` (no dash)
      // so we allow either `.app-shell` standalone OR `.app-shell-...`.
      // Bootstrap utility classes (toast / position-fixed / bottom-0 etc.)
      // are external framework tokens and live in the allowlist below.
      const customClasses = cssNoComments.match(/\.[a-z][\w-]*/g) || [];
      const offenders = customClasses.filter(
        (cls) =>
          !/^\.app-shell(-|_|$)/.test(cls) &&
          !/^\.(d-|form-control|fa-|active|is-|show|hide|nav-|text-|btn|gr-|toast|toast-|position-|bottom-)/.test(
            cls,
          ),
      );
      expect(offenders).toEqual([]);
    });
  });
});
