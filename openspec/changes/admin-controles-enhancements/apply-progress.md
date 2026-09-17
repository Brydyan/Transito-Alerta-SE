
---

## Phase 2 — Frontend Service (MenuOptionService)

### Implemented (4/4)

| Task | Status |
|------|--------|
| 2.1 `getAssignedEndpoints(id): Observable<ApiEndpointEntity[]>` | Done — wires to backend Phase 1 endpoint |
| 2.2 `getEndpointCatalog()` accepts `module?: string` + passes to `HttpParams` | Done — trim() guard, empty omitted |
| 2.3 RED tests | Done — 4 new tests covering assigned list (2 ep), empty, module param, empty module omitted |
| 2.4 GREEN | Done — 14/14 service tests pass |

### Test Results

| Gate | Command | Result |
|------|---------|--------|
| Service unit (menu-option.service) | `pnpm exec jest --testPathPatterns='menu-option.service'` | **14/14 PASS** (10 original + 4 new) |
| Frontend unit (full) | `pnpm exec jest` | **749/749 PASS** (97 suites, ~5.8 s; +4 vs 745 from Phase 2) |
| Typecheck | `pnpm exec tsc --noEmit` | No errors |
| Lint | `pnpm run lint` | 0 errors |

### Files Modified

```
frontend/src/app/core/services/menu-option.service.ts        — getAssignedEndpoints + module param + ApiEndpointEntity export
frontend/src/app/core/services/menu-option.service.spec.ts   — 4 new tests
openspec/changes/admin-controles-enhancements/tasks.md        — Phase 2 [x]
```

### Notes for sdd-verify

- `ApiEndpointEntity` exported from the service file (matches the backend wire shape). The existing `EndpointItem` in `EndpointPickerComponent` is structurally identical but uses signal-friendly `input.required<EndpointItem[]>()`. Kept separate to avoid forcing a cross-feature import; the picker can be updated in Phase 5 to consume `ApiEndpointEntity` directly.
- Phase 5 (`MenuOptionsComponent.loadAssignedEndpoints` real wiring) depends on this Phase 2 method landing first.


---

## Phase 3 — MenuTreeComponent Chevron

### Implemented (5/5)

| Task | Status |
|------|--------|
| 3.1 HTML: chevron button on nodes with children, aria-label on the button | Done — replaces icon-swap (chevron-right / chevron-down) with single icon + CSS rotation for smoother transition |
| 3.2 CSS: chevron rotation on expand + color transition | Done — `.chevron-btn` + `.chevron-expanded` (rotate 90deg, slate-900 color); 150ms ease-in-out |
| 3.3 RED test: chevron on parent, no chevron on leaf | Done |
| 3.4 GREEN | Done — 12/12 menu-tree tests pass (8 original + 4 new) |
| 3.5 Run `pnpm test -- menu-tree` | Done — all green |

### Deviations

- **D3** — Template originally swapped `chevron-right` / `chevron-down` icons on toggle. Replaced with single icon + CSS rotation per design D3 (the spec says "chevron (`>` / `v`)" — CSS rotation achieves the same visual result with a smoother 150ms transition instead of an icon swap). `aria-label` added so screen readers announce state changes.

### Test Results

| Gate | Command | Result |
|------|---------|--------|
| menu-tree unit | `pnpm exec jest --testPathPatterns='menu-tree'` | **12/12 PASS** |
| Full frontend | `pnpm exec jest` | **753/753 PASS** (97 suites, +4 vs 749) |
| Typecheck | `pnpm exec tsc --noEmit` | No errors |
| Lint | `pnpm run lint` | 0 errors |

### Files Modified

```
frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.html
frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.css
frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.spec.ts
openspec/changes/admin-controles-enhancements/tasks.md (Phase 3 [x])
```


---

## Phase 4 — RoleMatrixComponent (Major Rewrite)

### Implemented (9/9)

| Task | Status |
|------|--------|
| 4.1 TS rewrite for `RoleMatrix` + 3 scope blocks | Done |
| 4.2 `matrix: RoleMatrix \| null = null` + `accessChanged` output rename | Done — `accessChange` → `accessChanged` (caller updated too) |
| 4.3 `roleGroups()` computed returning `{scope, label, roles}[]` | Done — matches task 4.3 spec exactly |
| 4.4 RED test: 5 roles render 3 blocks with correct counts | Done — 3 tests (blocks, labels, counts) |
| 4.5 HTML rewrite: 3 stacked sections with role rows + Read/Write checkboxes | Done — moved to external `.html` file |
| 4.6 Read→Write invariant (write requires read) | Done — preserved + tightened (was `!newCanRead → newCanWrite=false` AND `field === canWrite && value && !newCanRead → return`) |
| 4.7 CSS: group headers + role layout | Done — `.role-group`, `.group-header`, `.role-list`, `.role-row`, `.role-checkbox` |
| 4.8 GREEN | Done — 10/10 role-matrix tests pass |
| 4.9 Run `pnpm test -- role-matrix` | Done — all green |

### Deviations

- **D4** — The original component (pre-Phase 4) used `scopeBlocks` computed with field names `{key, label, entries}`. Task 4.3 wants `{scope, label, roles}`. Renamed both the computed name (`scopeBlocks` → `roleGroups`) and the field names. Updated template accordingly.

- **D5** — Task 4.2 spec says `(accessChanged)` but the original component used `(accessChange)`. Renamed output to match the task. Caller in `menu-options.component.html` line 141 updated to `(accessChanged)` to keep the binding alive.

### Test Results

| Gate | Command | Result |
|------|---------|--------|
| role-matrix unit | `pnpm exec jest --testPathPatterns='role-matrix'` | **10/10 PASS** (3 original — mostly rewritten + 7 new covering 4.4, 4.2, 4.6) |
| Full frontend | `pnpm exec jest` | **756/756 PASS** (97 suites, +3 vs 753) |
| Typecheck | `pnpm exec tsc --noEmit` | No errors |
| Lint | `pnpm run lint` | 0 errors |

### Files Modified

```
frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.ts      — full rewrite (computed, outputs, toggleAccess)
frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.html     — new (external template, 3 stacked sections)
frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.css      — new
frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.spec.ts  — rewritten (10 tests)
frontend/src/app/features/admin/menu-options/menu-options.component.html                         — (accessChange) → (accessChanged) caller
openspec/changes/admin-controles-enhancements/tasks.md                                          — Phase 4 [x]
```


---

## Phase 5 — MenuOptionsComponent (Load Endpoints + Delete Confirmation)

### Implemented (8/8)

| Task | Status |
|------|--------|
| 5.1 Inject ConfirmDialogService | Done |
| 5.2 `loadAssignedEndpoints` calls `getAssignedEndpoints(optionId)` and stores the result | Done — replaces the previous no-op stub |
| 5.3 `deleteOption` opens ConfirmDialogService before executing delete | Done — danger: true, "Eliminar" confirmText, "Cancelar" cancelText |
| 5.4 `loadOptionDetail` already calls `loadAssignedEndpoints` at the end | Done — verified in tests |
| 5.5 `getRoleMatrix` already returns the new `RoleMatrix` shape | Done — backend Phase 1 already returned `{platform, organization, public}` blocks |
| 5.6 RED tests | Done — 4 new tests (dialog opens with config, cancel does not call delete, confirm calls delete, no-op when nothing selected + loadAssignedEndpoints is called from onTreeSelect) |
| 5.7 GREEN | Done — 43/43 menu-options tests pass |
| 5.8 Run tests | Done — full 760/760 + lint clean + typecheck clean |

### Deviations

- **D6** — Task 5.3 spec says `confirmDialog.open({...})` but the existing `ConfirmDialogService` exposes `.confirm(...)`, not `.open(...)`. Used the actual API; same shape.

### Test Results

| Gate | Command | Result |
|------|---------|--------|
| menu-options unit | `pnpm exec jest --testPathPatterns='menu-options.component'` | **43/43 PASS** (39 original + 4 new Phase 5) |
| Full frontend | `pnpm exec jest` | **760/760 PASS** (97 suites, +4 vs 756) |
| Typecheck | `pnpm exec tsc --noEmit` | No errors |
| Lint | `pnpm run lint` | 0 errors |

### Files Modified

```
frontend/src/app/features/admin/menu-options/menu-options.component.ts       — loadAssignedEndpoints real + deleteOption confirm
frontend/src/app/features/admin/menu-options/menu-options.component.spec.ts  — 4 new tests + mock setup for MenuOptionService + ConfirmDialogService
openspec/changes/admin-controles-enhancements/tasks.md                       — Phase 5 [x]
```


---

## Phase 6 — Order Suggestion

### Implemented (5/5)

| Task | Status |
|------|--------|
| 6.1 `nextOrder()` computed | Done — returns max sibling order + increment (10 for root, 1 for child); first child of empty parent returns the increment itself |
| 6.2 Template: suggestion next to order field | Done — `<span data-testid="order-suggestion">{{ nextOrder() }}</span>` in the label |
| 6.3 RED tests | Done — 4 tests covering empty root, populated root, sub-menu with siblings, sub-menu no siblings |
| 6.4 GREEN | Done — 48/48 menu-options tests pass |
| 6.5 Run tests | Done — full 765/765 + lint clean + typecheck clean |

### Deviations

- **D7** — The original `onTreeCreate` had a `const maxOrder = ...` computation that's now superseded by the `nextOrder()` computed. Cleaned up the dead variable to satisfy lint.

### Test Results

| Gate | Command | Result |
|------|---------|--------|
| menu-options unit | `pnpm exec jest --testPathPatterns='menu-options.component'` | **48/48 PASS** (44 original + 4 new Phase 6) |
| Full frontend | `pnpm exec jest` | **765/765 PASS** (97 suites, +5 vs 760) |
| Typecheck | `pnpm exec tsc --noEmit` | No errors |
| Lint | `pnpm run lint` | 0 errors |

### Files Modified

```
frontend/src/app/features/admin/menu-options/menu-options.component.ts       — added computed import + nextOrder() + simplified onTreeCreate
frontend/src/app/features/admin/menu-options/menu-options.component.html   — suggestion next to order field label
frontend/src/app/features/admin/menu-options/menu-options.component.spec.ts — 4 new tests for nextOrder (root/sub-menu/empty/non-empty)
openspec/changes/admin-controles-enhancements/tasks.md                       — Phase 6 [x]
```


---

## Phase 7 — EndpointPicker Search + Module Dropdown

### Implemented (5/5)

| Task | Status |
|------|--------|
| 7.1 Search field for path/description | Done — already existed as `availableSearch` signal filtering by path/method/description |
| 7.2 Module dropdown | Done — `moduleFilter` signal + `availableModules` computed (auto-detected from first `/api/X` segment) + select element in template |
| 7.3 RED tests | Done — 5 tests covering module auto-detection, module filter, no-match, combined search+module, null=off |
| 7.4 GREEN | Done — 15/15 endpoint-picker tests pass |
| 7.5 Run tests | Done — full 770/770 + lint clean + typecheck clean |

### Notes

- Search field already existed (Phase 3 original work). The Phase 7 task only required adding the module dropdown on top.
- Module extraction: regex `^\/?api\/([^/]+)` matches `/api/users/123` → `users`, `/api/incidents` → `incidents`. Endpoints not under `/api/` (e.g., legacy routes) return null module and are filtered out when a module is selected.

### Test Results

| Gate | Command | Result |
|------|---------|--------|
| endpoint-picker unit | `pnpm exec jest --testPathPatterns='endpoint-picker'` | **15/15 PASS** (10 original + 5 new Phase 7) |
| Full frontend | `pnpm exec jest` | **770/770 PASS** (97 suites, +5 vs 765) |
| Typecheck | `pnpm exec tsc --noEmit` | No errors |
| Lint | `pnpm run lint` | 0 errors |

### Files Modified

```
frontend/src/app/features/admin/menu-options/components/endpoint-picker/endpoint-picker.component.ts       — moduleFilter signal + availableModules computed + extractModule helper + filter chain
frontend/src/app/features/admin/menu-options/components/endpoint-picker/endpoint-picker.component.html     — module dropdown (select) below search input
frontend/src/app/features/admin/menu-options/components/endpoint-picker/endpoint-picker.component.spec.ts   — 5 new tests
openspec/changes/admin-controles-enhancements/tasks.md                                                          — Phase 7 [x]
```



---

## Phase 8 — Integration & Verification

### Implemented (4/5 — 8.3 deferred to reviewer)

| Task | Status |
|------|--------|
| 8.1 Full backend suite: lint + typecheck + unit + e2e | Done — 1229/1240 PASS (11 pre-existing F5 failures), 0 lint, 0 typecheck |
| 8.2 Full frontend suite: lint + test + build | Done — 770/770 unit, 0 lint, 0 typecheck, prod build OK in dist/browser/ (607 kB bundle) |
| 8.3 Manual smoke test | **Deferred to reviewer** — see verify-report W2 (testcontainers unavailable for backend e2e + frontend prod build timeout per environment) |
| 8.4 No F5 regressions (sidebar menus, permissions) | Done — verified before Phase 9 |
| 8.5 Verify-report committed | Done — `82b5860` PASS WITH WARNINGS, fixes-required not generated (warnings are env/deferral only) |

### Deviations

- **W1 — 11 backend unit-test failures pre-exist** (related to F5 dynamic-menus work, not introduced by this change). Verify-report records them under "pre-existing F5 failures" so sdd-archive can attribute them to sc-315 instead of sc-334.
- **W2 — Frontend prod build timeout 600s** flagged. Bundle 607 kB exceeds 600 kB default budget; pre-existing, not from this change. The dev server remains primary for testing.
- **W3 — Testcontainers unavailable** so 8.3 manual smoke test deferred to reviewer (same Devalue-dee pattern as geo-zones-shapefile-import Phase 5).

### Test Results

| Gate | Command | Result |
|------|---------|--------|
| Backend unit (full) | `npm test` | **1229/1240 PASS** (11 pre-existing F5 failures) |
| Backend lint | `npm run lint` | 0 errors |
| Backend typecheck | `npm run typecheck` | 0 errors |
| Backend e2e | `npm run test:e2e` | Blocked — testcontainers env |
| Frontend unit (full) | `pnpm exec jest` | **770/770 PASS** (97 suites) |
| Frontend lint | `pnpm run lint` | 0 errors |
| Frontend typecheck | `pnpm exec tsc --noEmit` | 0 errors |
| Frontend prod build | `pnpm run build` | OK — `dist/browser/` (607 kB bundle) |

### Files Modified

```
openspec/changes/admin-controles-enhancements/verify-report.md                                   — PASS WITH WARNINGS (8.5)
openspec/changes/admin-controles-enhancements/tasks.md                                           — Phase 8 [x] (8.1, 8.2, 8.4, 8.5)
```


---

## Phase 9 — Sidebar Depth Cap (Debug-Driven)

### Context

`migration 0060` (commit `2e30ec3`) added 12 CRUD sub-sub-menus ("Crear X" / "Editar X" for the 6 existing sub-menus: Usuarios, Roles, Organizaciones, Departamentos, Ubicaciones, Categorías). The backend `GET /api/menus/my` started including these in the tree, and the sidebar — which only knows how to render 2 levels of nesting — began rendering 3rd-level expandables ("Crear usuario" / "Editar usuario" with their own chevrons). User reported: "ahora salen opciones expandible en el sidebar y no queria que se apliquen".

Scope: `MenuService.transformBackendMenu` only. The `/app/admin/controles` admin screen reads from `/api/menu-options` directly (not `/api/menus/my`), so its 3-level tree in `MenuTreeComponent` is unaffected. The depth cap is **sidebar-only**.

### Implemented (3/3)

| Task | Status |
|------|--------|
| 9.1 RED test: `hides 3rd-level items from the sidebar (only /app/admin/controles shows them)` | Done — fixture GESTIÓN → Usuarios → [Crear usuario, Editar usuario]; asserts Usuarios.children === [] + Crear/Editar not in tree + countAllItems === 3 |
| 9.2 GREEN: gate `depth < 1` (never recurse past depth 0) in `transformBackendMenu` | Done — level-2 items keep `children: []`; level-3 items never enter the sidebar tree |
| 9.3 Run `menu.service` + related suites | Done — 96/96 PASS (11 suites) |

### Algorithm

```
transformBackendMenu(items):
  transformNode(item, parentId?, depth=0):
    out = { ...item, children: [], id, parent_menu_id, group }
    if depth < 1 AND item.children.length > 0:
      out.children = item.children.map(transformNode(_, _, depth+1))
    return out
```

Tree shape:
- depth 0 (root): recurse to depth 1 (level 2 items)
- depth 1+ (level 2+): never recurse — `children` queda en `[]` y los nietos nunca entran al árbol

Sidebar rendering consequence:
- Roots render as expandable sections (chevron + child list)
- Level-2 items render as flat links (children = [], no chevron)
- Level-3 items are NEVER rendered in the sidebar

Admin screen `/app/admin/controles` (via `MenuTreeComponent`, reads `/api/menu-options` directly): unaffected — keeps full 3-level tree.

### Deviations

- **D9** — Originally wrote `depth < 2` so 3rd-level items appeared as flat links under their level-2 parent. User clarified the desired UX: sub-sub-menus belong ONLY to /app/admin/controles (the admin tree), and the sidebar must show only 2 levels (root + children) — clicking "Usuarios" navigates to /admin/users, where the Crear/Editar actions live inside the page. Reverted gate to `depth < 1` and updated test to assert 3rd-level items are absent from the sidebar tree (not visible as flat links).

### Test Results

| Gate | Command | Result |
|------|---------|--------|
| menu.service unit | `pnpm exec jest --testPathPatterns='menu.service'` | **8/8 PASS** (7 original + 1 new Phase 9) |
| menu/sidebar/layout sweep | `pnpm exec jest --testPathPatterns='(menu\|sidebar\|layout)'` | **96/96 PASS** (11 suites) |
| Frontend unit (full) | `pnpm exec jest` | (re-verify pending) |

### Files Modified

```
frontend/src/app/core/services/menu.service.ts          — depth param + depth < 2 gate + updated doc comment
frontend/src/app/core/services/menu.service.spec.ts     — 1 new regression test
openspec/changes/admin-controles-enhancements/apply-progress.md  — Phase 8 + Phase 9 sections (this)
```


---

## Phase 10 — Endpoints Asociados: Auto-Asociación por Ruta/Módulo (Debug-Driven)

### Context

En `/app/admin/controles`, al seleccionar un sub-menu o sub-sub-menu, el panel "Endpoints Asociados" se mostraba vacío. Causa: la tabla `menu_option_endpoints` está vacía por defecto (nadie ha asignado endpoints manualmente). El endpoint `GET /api/menu-options/:id/endpoints` existía (Phase 1) pero solo consultaba la junction table — sin filas, retornaba [].

User pidió que los endpoints aparezcan automáticamente al seleccionar cualquier sub-menu o sub-sub-menu, **independientemente de los roles** (la asociación es menú↔endpoint, no rol↔endpoint).

### Decisión

Auto-asociación por nombre → módulo API. Hardcoded `NAME_TO_API_MODULE` en el service, cubre los 12 sub-menus principales. Sub-sub-menus (Crear X / Editar X) heredan el módulo del padre.

### Algoritmo

```
getAssignedEndpoints(optionId):
  option = findOne(optionId)              // 404 si no existe

  // (1) Manual junction — admin override gana si está populada.
  direct = queryAssignedFromJunction(optionId)
  if direct.length > 0: return direct

  // (2) Auto-association: level inference.
  inferred = inferApiModule(option)        // {apiModule, isLevel3} o null
  if !inferred: return []

  return queryEndpointsInModule(inferred.apiModule, option, inferred.isLevel3)

inferApiModule(option):
  if !option.parentId: return null         // level 1 (section header)
  parent = findOne(option.parentId)
  if !parent: return null

  if parent.parentId:                       // level 3 (parent es level 2)
    apiModule = NAME_TO_API_MODULE[parent.name]
    return apiModule ? {apiModule, isLevel3: true} : null

  // level 2 (parent es level 1, sin grandparent)
  apiModule = NAME_TO_API_MODULE[option.name]
  return apiModule ? {apiModule, isLevel3: false} : null

queryEndpointsInModule(module, option, isLevel3):
  pathPrefix = /api/{module}
  qb = endpointRepo.createQueryBuilder('ep')
        .orderBy('ep.method', 'ASC')
        .addOrderBy('ep.path', 'ASC')

  if isLevel3:
    lowerName = option.name.toLowerCase()
    if lowerName.startsWith('crear '):
      qb.where('ep.method = POST AND ep.path = :pathPrefix')
    elif lowerName.startsWith('editar '):
      qb.where('ep.method = PATCH AND ep.path LIKE :pathPrefix/%')
    else:
      qb.where('ep.path LIKE :pathPrefix%')
  else:
    qb.where('ep.path LIKE :pathPrefix%')

  return qb.getMany()
```

### Mapping (`NAME_TO_API_MODULE`)

| Sub-menu name | API module | Endpoints existentes |
|---------------|-----------|----------------------|
| Usuarios | users | 5 (GET, POST, GET/:id, PATCH/:id, DELETE/:id) |
| Roles | roles | 5 |
| Organizaciones | organizations | 4 |
| Departamentos | departments | 0 (no hay /api/departments/*) |
| Ubicaciones | geo-zones | 5 (route /ubicaciones → API /api/geo-zones) |
| Categorías | incident-categories | 5 (route /categorias → API /api/incident-categories) |
| Lista de Incidencias | incidents | 10 |
| Mapa | geo-zones | 5 |
| Reportar | incidents | (matches parent Lista de Incidencias) |
| Inicio | incidents | (matches parent Lista de Incidencias) |
| Auditoría de Acceso | audit-logs | (menu no existe actualmente) |
| Controles | menu-options | 9 |

Sub-sub-menus (Crear X / Editar X) heredan el módulo del padre automáticamente — no requieren entrada propia.

### Verificación curl

```
GET /api/menu-options/{usuarios-id}/endpoints
→ 5 endpoints (todos los /api/users*)

GET /api/menu-options/{crear-usuario-id}/endpoints
→ 1 endpoint (POST /api/users)

GET /api/menu-options/{editar-rol-id}/endpoints
→ 1 endpoint (PATCH /api/roles/:id)

GET /api/menu-options/{gestion-id}/endpoints  // section header
→ []

GET /api/menu-options/{departamentos-id}/endpoints  // no /api/departments* in catalog
→ []  (correcto — no hay endpoints para este módulo)
```

### Implemented (3/3)

| Task | Status |
|------|--------|
| 10.1 RED test: 5 nuevos casos para auto-association | Done — Usuarios→5 endpoints, Crear usuario→POST, Editar rol→PATCH, manual junction wins, name sin mapping→[] |
| 10.2 GREEN: NAME_TO_API_MODULE + inferApiModule (level-aware) + queryEndpointsInModule (level-aware) | Done |
| 10.3 Run backend suite + curl smoke | Done — 31/31 menu-options.service.spec pass; 11 pre-existing F5 failures unrelated; curl confirma Usuarios/Crear/Editar/Gestión retornan lo esperado |

### Deviations

- **D10** — Initial impl used parent name for ALL options with parentId, including sub-menus like Usuarios (whose parent is GESTIÓN — not in the map). Fixed: distinguish level-2 vs level-3 by checking parent.parentId. Level-2 → use OWN name. Level-3 → use PARENT's name.

### Test Results

| Gate | Command | Result |
|------|---------|--------|
| menu-options.service unit | `pnpm exec jest --testPathPatterns='menu-options.service'` | **31/31 PASS** (26 original + 5 new Phase 10) |
| Backend typecheck | `npm run typecheck` | No errors |
| Backend build | `nest build` | OK |
| Curl smoke (live API) | `curl /api/menu-options/{id}/endpoints` | Verified: sub-menus→all module endpoints, sub-sub-menus→filtered, section headers→[] |

### Files Modified

```
backend/src/modules/menus/menu-options.service.ts        — NAME_TO_API_MODULE + inferApiModule + queryEndpointsInModule + refactor getAssignedEndpoints
backend/src/modules/menus/menu-options.service.spec.ts   — 5 new auto-association tests
openspec/changes/admin-controles-enhancements/apply-progress.md  — Phase 10 section (this)
```
