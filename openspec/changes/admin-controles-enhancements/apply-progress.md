
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

