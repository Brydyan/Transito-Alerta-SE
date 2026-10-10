# Feature: rename `core/` → `infra/` (refactor paso 2)

- Feature: folder-rename-core-infra (Shortcut sc-409)
- Status: implementación completa — commit `6c7c0788ea03fb5970261e7e2f11c5e93d3e792b`
- Branch: `carlos_fp/sc-409/refactor-rename-core-to-infra-sc-`
- Delivery: chained-pr / stacked-to-main — PR único (≈24 refs, muy bajo de 400 líneas), mergea a `develop` en orden después de #108

## Objetivo

Renombrar mecánicamente `backend/src/core/` → `backend/src/infra/` para que el nombre del directorio comunique su rol real (adaptadores de infraestructura: almacenamiento + compresión de imágenes, clientes Redis), en línea con el refactor SC-407 (paso 2 del plan: `common/ → shared/` queda para el paso 3).

- **Por qué**: `core/` es un nombre genérico que sugiere dominio central cuando en realidad contiene solo infraestructura (`image`, `storage`, clients). `infra/` comunica límite arquitectónico (Hexagonal/Clean: adaptadores secundarios).
- **Alcance**: renombrar el directorio y los 24 imports externos (15 archivos). Los imports internos de `core/` (`./`, `../`) quedan intactos por `git mv`.
- **Fuera de alcance**: renombrar `common/ → shared/` (paso 3), renombrar `CoreModule` → `InfraModule`/`core.module.ts` → `infra.module.ts` (decisión pendiente — el nombre del módulo Nest hoy es aceptable; renombrarlo arrastraría símbolos exportados: `REDIS_CLIENT`, etc.).

## Checklist

- [x] T1: rama desde `develop` (inicial `carlos_fp/sc-407/refactor-paso-2-core-infra`; renombrada a `carlos_fp/sc-409/refactor-rename-core-to-infra-sc-` tras crear la story sc-409 en Shortcut para trazabilidad propia del rename)
- [x] T2: `git mv backend/src/core backend/src/infra`
- [x] T3: reescribir los 24 imports externos → `infra/` (15 archivos) + 17 refs en specs/test support (censo inicial excluía specs; typecheck los detectó)
- [x] T4: `npx tsc --noEmit -p backend/tsconfig.json` exit 0
- [x] T5: suite jest backend completa — 127 suites / 1340 passed / 11 skipped (baseline idéntico)
- [x] T6: work-unit commit conventional → `6c7c078` (46 files: 17 renames R100 + 28 con imports)

## Evidencia de verificación

| Check | Comando | Resultado |
|---|---|---|
| typecheck | `pnpm exec tsc --noEmit -p backend/tsconfig.json` | exit 0 |
| tests | `pnpm exec jest --silent` | 127 suites / 1340 passed / 11 skipped |
| commit | `git rev-parse HEAD` | `6c7c0788ea03fb5970261e7e2f11c5e93d3e792b` |

## Decisiones / rationale

- `git mv` mantiene los bytes (renames R100) y los imports internos relativos intactos → el diff queda solo en imports externos, mismo patrón validado en SC-407.
- No hay alias `@core` en tsconfig (`baseUrl: "./"` sin `paths`) → todos los imports son relativos; el censo por resolución real de path encontró exactamente 24 refs.
- No tocar `CoreModule`/`core.module.ts`: es el módulo Nest que exporta clientes con providers; renombrarlo es un cambio de API interna sin valor de límite arquitectónico inmediato y agranda el diff.