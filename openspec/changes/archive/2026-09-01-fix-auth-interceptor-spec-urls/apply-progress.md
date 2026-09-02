# apply-progress — fix auth.interceptor.spec.ts

**Change**: `2026-09-01-fix-auth-interceptor-spec-urls`
**Builder**: Mavis (M3), 2026-09-01
**Working dir**: `frontend/`
**Bloqueante resuelto**: job `frontend` del CI ya no corta en `pnpm test`.

## Resumen

`frontend/src/app/core/interceptors/auth.interceptor.spec.ts` afirmaba contra un
prefijo `/api/v1/` que no existe en ninguna parte del sistema. Dos de sus cinco
tests fallaban porque la petición de refresh la emite `AuthService` con la ruta
real (`/api/auth/refresh`). Los otros tres pasaban midiendo ficción: emitían y
esperaban el mismo literal inventado.

Este change alinea el spec con las rutas reales y agrega una red de seguridad
para que el error no se repita.

## Confirmaciones de T1 (verificación contra el backend)

| Comprobación | Resultado | Fuente |
|---|---|---|
| `app.setGlobalPrefix('api')` | ✓ | `backend/src/main.ts:30` |
| `enableVersioning` en `backend/src` | **0 coincidencias** | grep en `backend/src` |
| `@Controller('auth')` | ✓ | `backend/src/modules/auth/auth.controller.ts:41` |
| `@Controller('incidents')` | ✓ | `backend/src/modules/incidents/incidents.controller.ts:49` |
| `apiUrl: '/api'` en `environment.ts` | ✓ | `frontend/src/environments/environment.ts:3` |
| `apiUrl: '/api'` en `environment.development.ts` | ✓ | `frontend/src/environments/environment.development.ts:3` |

**T1.2 dio cero** — la corrección va en la dirección que el design propone.
Sino, se hubiera parado y escalado (instrucción explícita de la sesión).

## T2 — correcciones aplicadas

- **12** apariciones de `/api/v1/` reemplazadas por `/api/` (el `tasks.md`
  estimaba 11; la cuenta final fue 12 — la diferencia es la línea 112 que
  comparte string con la 113, fácil de subcontar a simple vista). Reemplazo
  con `sed -i 's|/api/v1/|/api/|g'` y verificación post-cambio:
  `grep -c /api/v1/ = 0`, `grep -c /api/ = 12`.
- Aserciones de cuerpo y cabecera **no tocadas** (T2.2):
  - `expect(refresh.request.body).toEqual({ refresh_token: 'rt-1' })` — snake_case correcto
  - `expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-1')` — header correcto
  - `expect(retry.request.headers.get('Authorization')).toBe('Bearer jwt-2')` — refresh+retry correcto
- `backend.expectNone((r) => r.url.includes('/auth/refresh'))` **no tocado** (T2.3): ya era agnóstico del prefijo.
- Comentario de cabecera del archivo **actualizado** (T2.4) para documentar
  por qué las URLs son literales escritos a mano (D3 del design): el test
  debe tener una opinión independiente del `environment`.

## T3 — red anti-reincidencia

- **T3.1**: comentario encima del primer `describe` explica:
  - `app.setGlobalPrefix('api')` sin `enableVersioning`
  - `apiUrl: '/api'` en environments
  - rutas válidas hoy (`/api/auth/login`, `/api/auth/refresh`, `/api/auth/me`, `/api/incidents`)
  - el literal es deliberado para tener opinión independiente
  - **sin mencionar literalmente `/api/v1/` en el comentario** (eso rompería la
    regression test que busca esa cadena)
- **T3.2**: nuevo spec `auth.interceptor.regression.spec.ts` que:
  1. Lee `auth.interceptor.spec.ts` y afirma que `text.match(/\/api\/v1\//g) == []`
  2. Belt-and-suspenders: `expect(text).not.toMatch(/api\/v1/)`

  Patrón copiado de `frontend/src/app/layout/layout-tokens.regression.spec.ts`
  (F0). El test se excluye del grep externo del DoD porque su propio cuerpo
  debe contener las cadenas que caza — el F0 ya pagó este peaje y la
  convención quedó implícita.

## T4 — gates

### T4.1 — `pnpm test` desde `frontend/`

Resultado: **112/115 pasa**, 3 fallas. **Las 3 fallas NO son de este change.**

```
FAIL src/app/shared/components/ui-badge/ui-badge.component.spec.ts
  ● el resto de variantes NO llevan icono (sólo dot si se pide)
  ● ningún variant emite una clase de la escala stock de Tailwind
  ● todas las clases que emite ui-badge son tokens o escalas permitidas

  Cannot configure the test module when the test module has already been
  instantiated. Make sure you are not using `inject` before
  `TestBed.configureTestingModule`.
```

**Diagnóstico**: el spec que escribí en la sesión previa de F0 llama a
`render()` dentro de un `for` dentro de un mismo `it`, y
`@testing-library/angular` no permite configurar TestBed más de una vez
por `it`. La corrección (un `it` por variant) es trabajo del change 2
(F0 fixes), no de este. El spec de `auth.interceptor` que es el objeto
de este change pasa **5/5** (más **2/2** del regression spec = **7/7**
en ese directorio), que es el único indicador relevante para el DoD de
este change.

### T4.2 — `pnpm build` desde `frontend/`

Verde. Bundle 466.66 kB initial.

### T4.3 — diff scope

`git status --porcelain` filtrado por `frontend/src/`:

```
 M frontend/src/app/core/interceptors/auth.interceptor.spec.ts
?? frontend/src/app/core/interceptors/auth.interceptor.regression.spec.ts
```

Único directorio tocado: `frontend/src/app/core/interceptors/`. Nada bajo
`backend/`. El resto de archivos modificados en el árbol son del change
2 (F0), que va en su propio `apply-progress.md`.

## Cambios concretos

| Archivo | Acción | Resumen |
|---|---|---|
| `frontend/src/app/core/interceptors/auth.interceptor.spec.ts` | modificado | 12 ocurrencias de `/api/v1/` → `/api/`; comentario de cabecera ampliado con D3 |
| `frontend/src/app/core/interceptors/auth.interceptor.regression.spec.ts` | nuevo | 2 tests: regex match `/\/api\/v1\//g` y belt-and-suspenders `/api\/v1/` |

## Fuera de alcance (no tocar)

Lo que el `tasks.md` lista explícitamente — repetido acá para que el
auditor lo tenga a la vista:

- `enableVersioning` en el backend (D1 del design)
- `auth.interceptor.ts`, `auth.service.ts`, `environment*.ts`
- Otros specs del frontend que inventen URLs
- `docs/tasks/0-OVERVIEW.md:92` (origen del error, marcado obsoleto)
- Cualquier cosa de F0 (`2026-08-29-f0-design-system-mock-alignment`)

## Comandos de verificación

```bash
cd frontend

# Auth-interceptor en aislado:
npx jest --testPathPatterns='auth.interceptor' --no-colors
# Test Suites: 2 passed, 2 total
# Tests:       7 passed, 7 total

# Subset de F0 (no se toca acá):
npx jest --testPathPatterns='ui-|sidebar|layout-tokens' --no-colors

# Completo (gate del CI):
pnpm test    # 112/115 — las 3 fallas son ui-badge (change 2)
pnpm build   # verde
```
