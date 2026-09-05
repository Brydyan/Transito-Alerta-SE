# Apply Progress: F2.3 — Ubicaciones (árbol)

**Change**: `2026-08-29-f2-catalogs-crud`
**Phase**: F2.3 — Ubicaciones (árbol jerárquico)
**Mode**: Standard (frontend; spec/test tasks deferred to later phases)
**Status**: F2.3 implementation tasks complete — `F2.3.4` (specs de `tree.util.ts`) left open (tests come later)

---

## Scope (this apply batch)

Implemented the Ubicaciones catalog against the REAL backend wire contract,
derived from `backend/src/entities/geo-zone.entity.ts` and
`backend/src/modules/geo-zones/geo-zones.controller.ts` (not from the design
guess which listed a `pais` level that does not exist).

## Files created

| File | What Was Done |
|------|---------------|
| `frontend/src/app/core/models/geo-zone.model.ts` | `GeoZone`, `GeoZoneLevel` (`provincia\|canton\|parroquia\|zona`), `GeoZoneNode` (client-derived `children`+`depth`), `CreateGeoZoneDto`, `UpdateGeoZoneDto`, `GeoJsonPolygon`, `GEO_ZONE_LEVEL_LABELS`. snake_case wire. |
| `frontend/src/app/core/services/geo-zone.service.ts` | `listAll()` (per_page 10000), `list()`, `getById`, `create`, `update`, `remove` over `HttpService`. |
| `frontend/src/app/features/catalogs/locations/tree.util.ts` | Pure `buildTree()` (two passes: link by id, then top-down DFS for `depth`), `filterTreePreservingAncestors()`, `getLevelParentLevel()`. No Angular imports. |
| `frontend/src/app/features/catalogs/locations/location-list/location-list.component.{ts,html}` | Tree list: expand/collapse chevrons (leaf nodes have none), indentation by `depth`, level badge with per-level Tailwind colors, mono code, level filter dropdown, client search (auto-expands match ancestors), confirm-dialog + toast delete with 409 handling, light summary cards (total, month count, level distribution). `*hasPermission` on create/edit/delete. |
| `frontend/src/app/features/catalogs/locations/location-form/location-form.component.{ts,html}` | Create/edit form: name, code, level, parent. Parent selector scoped to the immediate parent level (Cantón → only Provincia parents; Zona → any). Required parent for canton/parroquia. 422/409 handling, dirty-discard, toast. |
| `frontend/src/app/app.routes.ts` | Replaced `/ubicaciones` placeholder with list + `new` + `:id/edit` (permissionGuard + breadcrumb). No `// PLACEHOLDER F2` remains for ubicaciones. |

## polygon — REQUIRED by backend DTO

Read `backend/src/modules/geo-zones/dto/create-geo-zone.dto.ts` directly:
- **`CreateGeoZoneDto.polygon` is REQUIRED** (`@IsGeoJsonPolygon()`, not optional).
- `UpdateGeoZoneDto.polygon` is OPTIONAL.

**Handling**: the create call always sends a minimal valid placeholder GeoJSON
`Polygon` (a small bounding box) accepted by the validator
(`{ type: 'Polygon', coordinates: [...] }`); the update call omits `polygon`
(since F2.3 has no map/drawing tool and the form does not touch geometry).

## Verification

- `npx ng build` (production) → **success** (location-list & location-form present as lazy chunks).
- Temporary Jest run of `tree.util.ts`: **8/8 passed** — covered child-before-parent ordering (the D3 depth pitfall), orphans, self-parent, ancestor preservation, code matching, empty term, parent-level table. Temp spec was removed after verification (F2.3.4 real specs deferred).

## Deviations from design

1. **Summary cards (F2.3.9)**: `tasks.md` mentions "nivel crítico, sincronización"; the prompt's authoritative FILES spec and mock 06-01 were followed instead: **total, created this month, and level distribution**, all in the light card variant.
2. **Level values**: used the REAL backend wire `'provincia'|'canton'|'parroquia'|'zona'` — there is NO `'pais'` level in the backend (design.md D2 guess is wrong).

## Cierre F2 (Specs y E2E) completado

Se implementaron todos los specs unitarios y end-to-end pendientes para cerrar la fase F2:
- **Unit Testing**:
  - `tree.util.spec.ts` (F2.3.4): pruebas de orden, profundidad, huérfanos y `getLevelParentLevel`.
  - `incident-category.service.spec.ts` y `organization.service.spec.ts` (F2.1.3, F2.2.3): aserciones sobre el mapeo de campos wire a modelo (snake_case a interfaz cliente).
  - `category-list.component.spec.ts` y `organization-list.component.spec.ts` (F2.1.8, F2.2.7): aserción sobre renderizado y `empty-state-container`.
  - `category-form.component.spec.ts` y `organization-form.component.spec.ts` (F2.1.8, F2.2.7): validaciones y binding del error `422`.
- **E2E Testing (Playwright)**:
  - `catalogs-crud.e2e.ts` (F2.4.1): CRUD completo, búsqueda y aserciones de expansión hasta parroquia.
  - `catalogs-permissions.e2e.ts` (F2.4.2): validación del `permissionGuard` y `*hasPermission` en DOM.
- **Correcciones transversales**:
  - `placeholder.component.spec.ts`: se ajustó la aserción original de 6 placeholders a 3, ya que F2 reemplazó sus `// PLACEHOLDER F2` en `app.routes.ts` (F2.4.3).

**Status Actualizado**: F2 está 100% implementada y probada (tasks F2.0.3 a F2.4.4 completadas).

---

## Corrección de rutas documentadas (2026-09-05)

Las tablas de arriba y el `File Changes` de `design.md` listan rutas que **no** son las
que quedaron en el árbol. El layout real agrupa por dominio dentro de la feature y
prefija las interfaces con `I`:

| Documentado | Real |
|---|---|
| `core/models/geo-zone.model.ts` | `features/catalogs/locations/interfaces/igeo-zone.interface.ts` |
| `core/models/incident-category.model.ts` | `features/catalogs/incident-categories/interfaces/iincident-category.interface.ts` |
| `core/models/organization.model.ts` | `features/catalogs/organizations/interfaces/iorganization.interface.ts` |
| `core/services/geo-zone.service.ts` | `features/catalogs/locations/services/geo-zone.service.ts` |
| `core/services/incident-category.service.ts` | `features/catalogs/incident-categories/services/incident-category.service.ts` |
| `core/services/organization.service.ts` | `features/catalogs/organizations/services/organization.service.ts` |
| `features/catalogs/categories/` | `features/catalogs/incident-categories/` |

Además, `design.md` D2 sigue mostrando `GeoZoneLevel` con un nivel `'pais'` que **no
existe**. El wire real es `'provincia' | 'canton' | 'parroquia' | 'zona'`, confirmado en
`backend/src/entities/geo-zone.entity.ts` (`GEO_ZONE_LEVELS`). La implementación usa el
valor correcto; lo que quedó desactualizado es el diseño.

## Revisión y correcciones (2026-09-05)

Revisión de la rama contra el backend real. Suite previa: 261 tests en verde — ninguno
cubría los defectos de abajo, porque los fixtures inventaban la forma del wire en lugar de
derivarla del controlador (exactamente el modo de fallo de SC-209 que D2/R1 buscaba
evitar). Ver `tasks.md` §F2.5.

**Corregido dentro de F2** (suite: 285 tests, 47 suites, en verde; `ng build` OK):

1. **Árbol capado a 100 nodos** — `listAll()` pedía `per_page: 10000` contra
   `Math.min(perPage, MAX_PAGE_SIZE = 100)`. Latente hoy (~26 zonas sembradas), rompe al
   superar 100, que es el volumen objetivo de la Q1 del diseño. Ahora pagina con `total`.
2. **`updated_at` inexistente** en el wire de `geo-zones` y `organizations`. Eliminado de
   las interfaces; la tarjeta pasa a `lastCreated` sobre `created_at`.
3. **`permissionGuard` rebotaba en cada refresh** — decidía antes de que
   `GET /auth/me` hidratara la sesión. Ahora espera. `AuthService` no se tocó (F1/auth).
4. Specs nuevos: `geo-zone.service.spec.ts`, `location-list.component.spec.ts`.

**Derivado a un change de backend** (fuera del alcance que el proposal fija para F2):
el alta manda un polígono placeholder fijo de 1°×1° cerca de Quito, y
`GeofencingRepository.findZoneByPoint` resuelve con `ST_Contains(...) LIMIT 1` sin
`ORDER BY` — toda incidencia dentro de esa caja se rutea a una zona arbitraria. También
queda ahí el hecho de que ningún endpoint sirve {todas las zonas + `code` + sin
`polygon`}, que es lo que obligó al paginado. Ver
`openspec/changes/back/2026-09-05-geo-zones-catalog-contract/proposal.md`.
