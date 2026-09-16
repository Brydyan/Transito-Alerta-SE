# Apply Progress: Departments Menu (front/2026-09-15-departments-menu)

**Change**: Frontend CRUD UI for departments + backend enrichment (ConflictException + enriched list + soft-delete-with-timestamp + deferred menu entry)

**Status**: Phase 1 done (backend enrichment). Phase 2-8 pending.
**Last Updated**: 2026-09-15

---

## Phase 1: Backend Fixes + Enrichment ✅ done

### Files modified
- `backend/src/modules/departments/departments.repository.ts` — `EnrichedDepartmentRow` interface, `ENRICHED_SELECT_COLUMNS`, rewritten `list()` SQL with LEFT JOINs + GROUP BY, `softDelete()` returns row shape.
- `backend/src/modules/departments/departments.repository.spec.ts` — updated 5 existing tests (column alias prefixes `d.`), added 1 enriched-list test, updated 2 softDelete tests for new return shape.
- `backend/src/modules/departments/departments.service.ts` — `ConflictException` for UNIQUE collision, `delete()` returns `{ id, deleted_at }` (race-aware), `ListResult` re-exports the enriched item type.
- `backend/src/modules/departments/departments.service.spec.ts` — UNIQUE collision test expects `ConflictException`.
- `backend/src/modules/departments/departments.controller.ts` — `remove()` no longer `@HttpCode(204)`, returns the deleted row.
- `backend/src/modules/departments/departments.controller.spec.ts` — DELETE test asserts the new shape.
- `backend/src/modules/menus/menu-map.ts` — only inline comment for the deferred entry.
- `backend/src/modules/menus/menu-map.spec.ts` — 2 `describe.skip`'d tests for the deferred entry.

### Verified
- `rtk jest src/modules/departments/` → 60/60 PASS (added 1 enriched-list test)
- `rtk jest src/modules/menus/` → green (with 2 skipped for deferred entry)
- `rtk jest` (full backend) → **1126/1126 PASS** (was 1124, +2: enriched-list repo + 2 demo tests unchanged)
- `npx tsc -b tsconfig.json --noEmit` → 0 errors
- `rtk npm run lint` → 0 errors
- `rtk npm run build` → success

### Deviations in Phase 1

- **1.10 — MENU_MAP entry DEFERRED to Phase 5**: tasks.md says add the `Departamentos` entry in Phase 1. Implementation deferred because the project's CRITICAL-2 test (`MENU_MAP↔app.routes.ts` coherence) fails if a route's segments don't exist in the frontend router. Splitting the work keeps every commit green: backend entry in Phase 5, frontend route tree in Phase 5.1, both landed together. The skip in `menu-map.spec.ts` documents the deferral inline.

### Notable implementation details

- `list()` SQL uses `LEFT JOIN organizations o ON o.id = d.organization_id AND o.deleted_at IS NULL` — soft-deleted orgs return `organization_name = NULL` for their depts rather than excluding the dept row. This is intentional: a dept whose org was soft-deleted should still appear (admin can clean it up). The frontend renders the empty cell accordingly (TBD in Phase 3).
- `user_count` uses `COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL)` — partial count inside the dept row, not a global count. No `GROUP BY u.id` explosion.
- `softDelete()` now returns `Promise<{ id, deleted_at } | null>`. The service treats `null` (race: deleted between findByIdActive and softDelete) as 404 with the same error wording as a missing dept — clients can't distinguish.
- Service `delete()` carries a comment explaining the orphan-before-softDelete ordering rationale (design D3 of the original departments-module) and the race window between findByIdActive and softDelete.

---

## Phase 2-8: Pending

Next step is Phase 2 (frontend interfaces + service) → 3 (DepartmentListComponent) → 4 (DepartmentFormComponent) → 5 (routes + the deferred MENU_MAP entry). Phase 6-7 are integration tests; Phase 8 is verification + manual smoke.

Per tasks.md header this change is "ask-on-risk" delivery. Recommend chaining PRs as tasks.md suggested:
- PR 1 (DONE): backend enrichment + fixes
- PR 2 (next): frontend service + components + routing
- PR 3: tests
