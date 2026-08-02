import { defineConfig } from 'vitest/config';
import { allTestGlobs, sharedTestConfig } from './vitest.shared.js';

export default defineConfig({
  test: {
    ...sharedTestConfig,
    include: allTestGlobs,
  },
});
