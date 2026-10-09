# entities-per-owner — una entidad, un dueño (paso 1 del ordenamiento modular)

> Objetivo: eliminar `backend/src/entities/` moviendo cada entidad a su módulo dueño
> y reescribiendo TODOS los imports afectados. Cambio **puramente mecánico**: cero
> cambios de lógica, cero refactor de comportamiento.

## Estado: implementación completa — commit `1152e77` en rama `carlos_fp/sc-407/refactor-entities-per-owner` (ticket SC-407); review nativo en vuelo, PR de la cadena apilada pendiente

## Problema

Hoy las entidades están partidas en dos mundos sin criterio:

- `backend/src/entities/` → 18 entidades globales (`user`, `incident`, `role`, …)
- `backend/src/modules/*/entities/` → 7 entidades locales (`notification`, `menu-option`, …)

Consecuencia: **103 archivos** importan entidades cruzadas por ruta relativa
(`../../../entities/…`), lo que acopla todos los módulos contra una carpeta compartida
y hace que el "módulo" no sea dueño de su propio modelo de datos. Además la
convención es inconsistente: `notification.entity.ts` vive en su módulo, pero
`incident.entity.ts` no.

## Por qué (decisión)

Regla: **una entidad, un dueño**. La entidad vive en `modules/<owner>/entities/` y los
consumidores importan desde la ruta del dueño. Esto no desacopla por sí solo (el import
sigue existiendo), pero hace el acoplamiento **visible, unidireccional y automatizable**
por lint de fronteras (paso 5 del plan).

## Alcance autorizado

- `git mv` de las 18 entidades + sus specs de `src/entities/` a `modules/<owner>/entities/`.
- Reescritura de las rutas de import en todos los consumidores (incluye `common/`, `core/`, `config/`).
- Borrado del directorio `src/entities/` al quedar vacío.
- Verificación: `typecheck` + suite unitaria contra baseline.

## Fuera de alcance (NO tocar en este paso)

- Cambiar el acceso a entidades ajenas por servicios exportados (eso es un refactor de comportamiento).
- Unificar los 11 módulos sin `repository.ts`.
- Partir los 5 archivos god.
- Renombrar `common/` → `shared/` o `core/` → `infra/` (paso 2).

## Mapa de propiedad (18 entidades)

| Entidad | Módulo dueño |
|---|---|
| `assignment.entity` | `assignments` |
| `audit-event.entity` | `audit` |
| `comment.entity` | `comments` |
| `comment-image.entity` | `comments` |
| `department.entity` | `departments` |
| `geo-zone.entity` | `geo-zones` |
| `incident-category.entity` | `incident-categories` |
| `incident.entity` | `incidents` |
| `incident-image.entity` | `incidents` |
| `incident-reporters.entity` | `incidents` |
| `invitation.entity` | `invitations` |
| `organization.entity` | `organizations` |
| `password-reset-token.entity` | `auth` |
| `permission.entity` | `permissions` |
| `role.entity` | `roles` |
| `status-history.entity` | `status-history` |
| `user.entity` | `users` |
| `user-session.entity` | `sessions` |

## Checklist

- [x] **T1** — Baseline de la suite unitaria registrado (evidencia, ver abajo).
- [x] **T2** — Documento de feature + espejo en Engram.
- [x] **T3** — Branch `carlos_fp/sc-407/refactor-entities-per-owner` (creado por el usuario tras abrir SC-407 en Linear).
- [x] **T4** — `git mv` de las 18 entidades + specs a `modules/<owner>/entities/`.
- [x] **T5** — Reescritura de imports (script determinista por profundidad relativa).
- [x] **T6** — `typecheck` verde.
- [x] **T7** — Suite unitaria sin regresiones vs baseline.
- [x] **T8** — Commit del work unit + reporte de archivos muertos detectados (`1152e77`, 252 insertions / 139 deletions / 116 files).

## Mapa de delegación (route declaration)

| Tarea | Ruta | Evidencia del trigger |
|---|---|---|
| T3–T8 | **inline** | Transformación mecánica ya entendida, aplicada por script determinista; aún así varias decenas de archivos → se verifica con suite completa. Subagentes `task` no disponibles en este runtime (free tier). |

## Delivery strategy (decidida por el usuario, 2026-10-08)

- `delivery_strategy`: **chained-pr** — el refactor completo del backend se entrega por pasos secuenciales.
- `chain_strategy`: **stacked-to-main** — cada PR mergea a `develop` en orden; cada paso deja la base verde.
- Regla del skill `chained-pr`: PR ≤400 líneas (add+del) y enfocado → PR único; si un paso individual excede ~400 líneas, se parte en slices apilados. No mezclar estrategias.
- SC-407 actual: 391 líneas (add+del), 116 archivos → cabe como PR único de la cadena.

## Modo TDD

**No establecido** — no existe memoria `sdd-init/<proyecto>` con capacidades de testing ni
elección explícita del usuario. Runner disponible: `pnpm test` (jest). Al no estar habilitado,
se corren **checks funcionales** (typecheck + suite existente), no TDD estricto.

## Criterios de aceptación

1. `backend/src/entities/` no existe.
2. Cada entidad vive en `modules/<owner>/entities/`.
3. `pnpm exec tsc --noEmit -p tsconfig.json` exit 0.
4. Suite unitaria: **0 fallos** y mismo conteo que baseline (1340 passed / 11 skipped / 127 suites).
5. `git status` sin archivos huérfanos ni rutas rotas.

## Evidencia

### Baseline (antes del cambio, `develop` @ `b4d1271`)

```
Test Suites: 127 passed, 127 total
Tests:       11 skipped, 1340 passed, 1351 total
Time:        54.508 s
```

## Hallazgos colaterales (reportar, NO resolver acá)

- `entities/password-reset-token.entity.ts` → **0 referencias** en todo `src/`. Código muerto.
- `entities/user-session.entity.ts` → sólo lo importa su propio spec; `sessions.repository.ts`
  usa SQL crudo. Código muerto.
- `entities/invitation.entity.ts` → sí se usa (`invitations.repository.ts`), el censo inicial
  lo reportó como 0 por un bug del script de conteo; corregido en la ejecución.
