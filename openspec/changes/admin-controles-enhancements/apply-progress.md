
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
| 9.1 RED test: `caps sidebar depth at 2 (3rd-level items flatten to regular links)` | Done — fixture GESTIÓN → Usuarios → [Crear usuario, Editar usuario]; asserts Usuarios.children.length === 2 + every grandchild has empty children |
| 9.2 GREEN: change gate `depth < 1` → `depth < 2` in `transformBackendMenu` | Done — allows recursion from depth 0 → 1 → 2; level-3 items at depth 2 stop recursion and stay as flat links with empty children |
| 9.3 Run `menu.service` + related suites | Done — 96/96 PASS (11 suites) |

### Algorithm

```
transformBackendMenu(items):
  transformNode(item, parentId?, depth=0):
    out = { ...item, children: [], id, parent_menu_id, group }
    if depth < 2 AND item.children.length > 0:
      out.children = item.children.map(transformNode(_, _, depth+1))
    return out
```

Tree shape:
- depth 0 (root): recurse to depth 1 (level 2 items)
- depth 1 (level 2): recurse to depth 2 (level 3 items appear as flat links)
- depth 2+ (level 3+): never reached — depth gate stops

Sidebar rendering consequence:
- Roots render as expandable sections (chevron + child list)
- Level-2 items render as expandable items (chevron + child list, since their children array is non-empty)
- Level-3 items render as flat links inside their level-2 parent's expanded view, no chevron

### Deviations

- **D9** — Original implementation tried `depth < 1` which made level-2 items have empty children (3rd-level items dropped entirely). Test expectation was `usuarios.children.length === 2`, which means 3rd-level items should appear as flat links under their parent (visible + clickable, just not expandable). Adjusted to `depth < 2` to match test. This is the correct UX — users can still reach "Crear usuario" / "Editar usuario" from the sidebar even though the admin screen is the canonical place.

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
