
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

