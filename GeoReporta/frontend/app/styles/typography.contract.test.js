import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const variablesPath = resolve(frontendRoot, 'public/css/variables.css');
const appPath = resolve(frontendRoot, 'public/css/app.css');
const responsivePath = resolve(
  frontendRoot,
  'public/css/mobile-responsive.css',
);
const dashboardPath = resolve(
  frontendRoot,
  'app/dashboard/pages/dashboard/dashboard.component.css',
);

let variablesCss;
let appCss;
let responsiveCss;
let dashboardCss;
let buildOutDir;

function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function customProperty(name) {
  const match = variablesCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return match?.[1].trim();
}

beforeAll(() => {
  variablesCss = withoutComments(readFileSync(variablesPath, 'utf8'));
  appCss = withoutComments(readFileSync(appPath, 'utf8'));
  responsiveCss = withoutComments(readFileSync(responsivePath, 'utf8'));
  dashboardCss = withoutComments(readFileSync(dashboardPath, 'utf8'));
});

afterAll(() => {
  if (buildOutDir) rmSync(buildOutDir, { recursive: true, force: true });
});

describe('typography stylesheet contract', () => {
  it('maps all heading levels to centralized type tokens', () => {
    for (const heading of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      expect(customProperty(`font-size-${heading}`)).toMatch(/rem|clamp\(/);
      expect(appCss).toMatch(
        new RegExp(
          `${heading}\\s*\\{[^}]*font-size:\\s*var\\(--font-size-${heading}\\)`,
        ),
      );
    }

    expect(customProperty('line-height-body')).toBe('1.5');
    expect(customProperty('line-height-heading')).toBe('1.2');
    expect(appCss).toMatch(
      /h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{[^}]*line-height:\s*var\(--line-height-heading\)/,
    );
  });

  it('keeps h5 and h6 below the removed 32px responsive rule', () => {
    expect(customProperty('font-size-h5')).not.toContain('32px');
    expect(customProperty('font-size-h6')).not.toContain('32px');
    expect(responsiveCss).not.toContain('clamp(18px, 5vw, 32px)');
    expect(responsiveCss).not.toMatch(/h[1-6][^{]*\{[^}]*font-size:/);
  });

  it('keeps shared page-title typography out of dashboard overrides', () => {
    expect(appCss).toMatch(
      /\.gr-page__title\s*\{[^}]*font-size:\s*var\(--font-size-page-title\)/,
    );
    expect(dashboardCss).not.toMatch(/\.gr-page__title\s*\{/);
    expect(dashboardCss).not.toMatch(/\.gr-breadcrumb\s*\{/);
  });

  it('form-check radios escape the generic input min-height stretch', () => {
    // Regression: the assignment role radios in the incidencias detail page
    // use <input class="form-check-input" type="radio">. Bootstrap renders them
    // as a 1em square, but the mobile-first `input` rule above sets
    // `min-height: clamp(40px, 10vw, 44px)`, which stretched the 16px-wide
    // radio into a 40-44px vertical ellipse. The anti-stretch block must
    // cover radios explicitly with a square 1em reset.
    const radioBlock = responsiveCss.match(
      /\.form-check-input\[type="radio"\]\s*\{([^}]*)\}/,
    );
    expect(
      radioBlock,
      'expected a .form-check-input[type="radio"] reset block in mobile-responsive.css',
    ).not.toBeNull();

    const body = radioBlock[1];
    expect(body).toMatch(/min-height:\s*0\b/);
    expect(body).toMatch(/min-width:\s*0\b/);
    expect(body).toMatch(/flex-shrink:\s*0\b/);
    // 1em × 1em preserves the Bootstrap default; the global input rule sets
    // font-size: 16px !important so this resolves to a 16px square.
    expect(body).toMatch(/width:\s*1em\b/);
    expect(body).toMatch(/height:\s*1em\b/);
  });

  it('copies the responsive stylesheet into a production build', () => {
    buildOutDir = mkdtempSync(resolve(tmpdir(), 'typography-build-'));

    execFileSync(
      process.execPath,
      [
        resolve(frontendRoot, 'node_modules/vite/bin/vite.js'),
        'build',
        '--outDir',
        buildOutDir,
        '--emptyOutDir',
      ],
      { cwd: frontendRoot, stdio: 'pipe' },
    );

    expect(existsSync(resolve(buildOutDir, 'css/mobile-responsive.css'))).toBe(
      true,
    );
    expect(readFileSync(resolve(buildOutDir, 'index.html'), 'utf8')).toContain(
      '/css/mobile-responsive.css',
    );
  }, 30000);
});
