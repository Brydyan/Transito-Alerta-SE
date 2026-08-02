import { defineConfig } from 'vite';

// Component *.component.html / *.component.css files are bundled into the
// JS chunks via `?raw` imports (see each *.component.js), so Vite tracks
// them natively — no copy plugin and no runtime fetch needed.

export default defineConfig({
  // index.html vive en la raíz del proyecto (frontend/), igual que hoy.
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  // frontend/public/ (antes frontend/assets/) se copia tal cual a dist/,
  // sin procesar — necesario porque dashboard.component.js inyecta
  // <script>/<link> hacia assets/extra-libs/c3/* en runtime con strings,
  // no con import estático, así que Vite no puede rastrearlos.
  publicDir: 'public',
  server: {
    port: 3000,
    proxy: {
      // Proxy /api requests to the Laravel backend during development.
      // This is required for Playwright E2E tests that need to authenticate
      // (loginAsAdmin() calls POST /api/login and the SPA calls /api/me).
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
