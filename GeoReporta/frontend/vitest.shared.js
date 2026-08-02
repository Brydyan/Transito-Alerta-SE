export const sharedTestConfig = {
  environment: 'jsdom',
  setupFiles: ['./app/core/vitest.setup.js'],
  globals: true,
  // NOTE: clearMocks, restoreMocks, and mockReset are intentionally omitted —
  // they cause cross-test pollution by clearing mock implementations.
  // Each test file manages its own mock cleanup via local afterEach hooks.
  css: true,
};

export const unitTestGlobs = [
  'app/**/*.test.js',
  'app/**/__tests__/**/*.spec.js',
];
export const integrationTestGlobs = ['app/**/*.integration.test.js'];
export const snapshotTestGlobs = ['app/**/*.snapshot.test.js'];
export const allTestGlobs = [
  ...unitTestGlobs,
  ...integrationTestGlobs,
  ...snapshotTestGlobs,
];
