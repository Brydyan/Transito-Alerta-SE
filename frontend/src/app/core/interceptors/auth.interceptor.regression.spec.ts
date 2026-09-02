import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Red de seguridad (T3.2, design del change
 * `2026-09-01-fix-auth-interceptor-spec-urls`).
 *
 * El backend expone prefijo `api` sin segmento de versión
 * (`backend/src/main.ts:30`, `app.setGlobalPrefix('api')`, grep en
 * cero para `enableVersioning` en `backend/src`). Si un futuro
 * cambio re-introduce `/api/v1` en el spec del interceptor, este
 * test rompe el build antes de que el descuido llegue al CI.
 *
 * Patrón copiado de `frontend/src/app/layout/layout-tokens.regression.spec.ts`
 * (F0). El test se excluye a sí mismo del match cuando necesita
 * mencionar la cadena prohibida en su propio mensaje de error.
 */
const TARGET = path.resolve(__dirname, 'auth.interceptor.spec.ts');

describe('auth.interceptor — no versionado de API', () => {
  it('no contiene `/api/v1/` (el backend no expone versionado)', () => {
    const text = fs.readFileSync(TARGET, 'utf8');
    const matches = text.match(/\/api\/v1\//g);
    expect(matches ?? []).toEqual([]);
  });

  it('no contiene el literal `api/v1` en ninguna forma', () => {
    const text = fs.readFileSync(TARGET, 'utf8');
    // Belt-and-suspenders: cubre `api/v1/` y también `api/v1` sin slash.
    expect(text).not.toMatch(/api\/v1/);
  });
});
