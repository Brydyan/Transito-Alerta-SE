# Feature: rename `core/` → `infra/` (refactor paso 2)

- Feature: folder-rename-core-infra
- Status: en progreso
- Branch: `carlos_fp/sc-407/refactor-paso-2-core-infra`
- Delivery: chained-pr / stacked-to-main — PR único (≈24 refs, muy bajo de 400 líneas), mergea a `develop` en orden después de #108

## Objetivo

Renombrar mecánicamente `backend/src/core/` → `backend/src/infra/` para que el nombre del directorio comunique su rol real (adaptadores de infraestructura: almacenamiento + compresión de imágenes, clientes Redis), en línea con el refactor SC-407 (paso 2 del plan: `common/ → shared/` queda para el paso 3).

- **Por qué**: `core/` es un nombre genérico que sugiere dominio central cuando en realidad contiene solo infraestructura (`image`, `storage`, clients). `infra/` comunica límite arquitectónico (Hexagonal/Clean: adaptadores secundarios).
- **Alcance**: renombrar el directorio y los 24 imports externos (15 archivos). Los imports internos de `core/` (`./`, `../`) quedan intactos por `git mv`.
- **Fuera de alcance**: renombrar `common/ → shared/` (paso 3), renombrar `CoreModule` → `InfraModule`/`core.module.ts` → `infra.module.ts` (decisión pendiente — el nombre del módulo Nest hoy es aceptable; renombrarlo arrastraría símbolos exportados: `REDIS_CLIENT`, etc.).

## Checklist

- [ ] T1: rama desde `develop` (`carlos_fp/sc-407/refactor-paso-2-core-infra`)
- [ ] T2: `git mv backend/src/core backend/src/infra`
- [ ] T3: reescribir los 24 imports externos → `infra/` (15 archivos)
- [ ] T4: `npx tsc --noEmit -p backend/tsconfig.json` exit 0
- [ ] T5: suite jest backend completa (baseline: 1340 passed / 11 skipped / 127 suites)
- [ ] T6: work-unit commit conventional (`refactor(backend): rename core/ to infra/ ...`) + registrar hash en este doc

## Evidencia de verificación

| Check | Comando | Resultado |
|---|---|---|
| typecheck | `npx tsc --noEmit -p backend/tsconfig.json` | pendiente |
| tests | `pnpm --filter backend test` (o runner raíz de backend) | pendiente |
| commit | `git rev-parse HEAD` | pendiente |

## Decisiones / rationale

- `git mv` mantiene los bytes (renames R100) y los imports internos relativos intactos → el diff queda solo en imports externos, mismo patrón validado en SC-407.
- No hay alias `@core` en tsconfig (`baseUrl: "./"` sin `paths`) → todos los imports son relativos; el censo por resolución real de path encontró exactamente 24 refs.
- No tocar `CoreModule`/`core.module.ts`: es el módulo Nest que exporta clientes con providers; renombrarlo es un cambio de API interna sin valor de límite arquitectónico inmediato y agranda el diff.