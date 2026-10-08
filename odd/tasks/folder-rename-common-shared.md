# Feature: rename `common/` → `shared/` (refactor paso 3)

- Feature: folder-rename-common-shared (Shortcut sc-410)
- Status: en progreso
- Branch: `carlos_fp/sc-410/refactor-rename-common-to-shared-`
- Delivery: chained-pr / stacked-to-main — PR único (solo imports, muy bajo de 400 líneas), mergea a `develop` en orden después de #109

## Objetivo

Renombrar mecánicamente `backend/src/common/` → `backend/src/shared/` para que el directorio comunique su rol real (código reutilizable entre módulos: authz, guards, interceptors, utils, observabilidad), en línea con el refactor SC-407 (paso 3 del plan: `core/ → infra/` ya hecho en sc-409/PR #109).

- **Por qué**: `common/` es un nombre genérico que no distingue qué contiene; `shared/` comunica "código compartido entre módulos" (limitar el acceso de capas: modules → shared, nunca al revés). Consistencia con el límite arquitectónico establecido con `infra/`.
- **Alcance**: renombrar el directorio (22 archivos / 10 subdirs) y reescribir los **150 imports externos en 86 archivos** (`../../common/...` → `../../shared/...`). Los imports internos de `common/` (`./`, `../`) quedan intactos por `git mv`.
- **Fuera de alcance**: renombrar símbolos exportados (`RequirePermission`, guards, interceptors, etc.) — solo el path físico cambia; documentar `TECH_STACK.md` si menciona la estructura.

## Checklist

- [ ] T1: rama desde `develop` (`carlos_fp/sc-410/refactor-rename-common-to-shared-`)
- [ ] T2: `git mv backend/src/common backend/src/shared`
- [ ] T3: reescribir los 150 imports externos → `shared/` (86 archivos: src, specs, test support, entities, infra, main)
- [ ] T4: `pnpm exec tsc --noEmit -p backend/tsconfig.json` exit 0
- [ ] T5: suite jest backend completa — 127 suites / 1340 passed / 11 skipped (baseline idéntico)
- [ ] T6: work-unit commit conventional + registrar hash en este doc

## Evidencia de verificación

| Check | Comando | Resultado |
|---|---|---|
| typecheck | `pnpm exec tsc --noEmit -p backend/tsconfig.json` | pendiente |
| tests | `pnpm exec jest --silent` | pendiente |
| commit | `git rev-parse HEAD` | pendiente |

## Decisiones / rationale

- Mismo patrón validado en sc-409 (`core/ → infra/`): `git mv` mantiene bytes (R100) y los imports internos relativos intactos → el diff queda solo en imports externos.
- No hay alias `@common` en tsconfig (`baseUrl: "./"` sin `paths`) → todos los imports son relativos; el censo por resolución real de path encontró exactamente 150 refs en 86 archivos.
- El censo incluye specs (`.spec.ts`), controllers, entities y test support: la lección de sc-409 (el typecheck cazó specs que el censo inicial había excluido) se aplica desde el arranque.
- No tocar símbolos exportados: el rename es solo de path físico; renombrar `RequirePermission` u otros export públicos agrandaría el diff sin valor de límite arquitectónico inmediato.