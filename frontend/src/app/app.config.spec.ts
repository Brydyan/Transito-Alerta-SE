import { appConfig } from './app.config';

/**
 * T-32 — RED: scroll position restoration is enabled at router level (D14).
 *
 * Angular 21 uses withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })
 * (older alias withScrollPositionRestoration may not exist). The design.md D14
 * literal is withScrollPositionRestoration('enabled') — accept either spelling
 * but require 'enabled' restoration.
 */
describe('appConfig — scroll restoration (D14 / S5.3)', () => {
  it('provides router with scrollPositionRestoration enabled', () => {
    // Most stable signal: inspect the source file directly (Angular
    // feature providers are opaque objects that cannot be JSON-stringified).
    // Keep the imported appConfig to ensure the module loads, but assert
    // on file content.
    expect(appConfig.providers?.length).toBeGreaterThan(0);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const configPath = path.join(__dirname, 'app.config.ts');
    let content = '';
    try {
      content = fs.readFileSync(configPath, 'utf8');
    } catch {
      content = '';
    }
    // Fallback if fs read fails in jsdom (unlikely): stringify providers safely
    if (!content) {
      try {
        content = String(appConfig.providers);
      } catch {
        content = '';
      }
    }

    const hasWithInMemory = content.includes('withInMemoryScrolling');
    const hasLegacy = content.includes('withScrollPositionRestoration');
    const hasEnabled = content.includes('scrollPositionRestoration') && content.includes("'enabled'");

    expect(hasWithInMemory || hasLegacy).toBe(true);
    expect(hasEnabled).toBe(true);
  });
});
