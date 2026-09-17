
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

