# Tasks: F6 — Audit Logs UI (Frontend)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–380 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR — all 7 files, tightly coupled |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | All frontend files (service + component + route + link fix) | PR 1 | `cd frontend && ng test --include=audit-logs` | N/A — requires backend deployed with migration 0053 | Delete `audit-logs/` directory, revert `app.routes.ts`, revert `users-list.component.html` |

---

## Phase 1: Foundation / Infrastructure

- [x] 1.1 Create directory `frontend/src/app/features/admin/audit-logs/services/` (implicit from file creation).
- [x] 1.2 **RED** — Create failing unit test `frontend/src/app/features/admin/audit-logs/services/audit-logs.service.spec.ts`: verifies `getAuditLogs()` calls `GET /api/audit-logs` with params; `exportCsv()` calls `GET /api/audit-logs/export.csv` with `responseType: 'blob'` and does NOT use `window.open`; `getUsers()` calls `GET /api/users/form-data`. Spec scenario: "CSV download uses blob, not window.open" (R4-S3).
- [x] 1.3 **GREEN** — Create `frontend/src/app/features/admin/audit-logs/services/audit-logs.service.ts` — `@Injectable({ providedIn: 'root' })`, methods: `getAuditLogs(filters: AuditLogFilters & { page: number; limit: number })`, `exportCsv(filters: AuditLogFilters): Observable<Blob>` with `responseType: 'blob'`, `getUsers(): Observable<{id:string; firstName:string; lastName:string}[]>`.
- [x] 1.4 Modify `frontend/src/app/app.routes.ts` — add sibling route under admin children: `{ path: 'audit-logs', data: { breadcrumb: 'Auditoría de Acceso', permission: 'READ audit-logs' }, canActivate: [permissionGuard], loadComponent: () => import('./features/admin/audit-logs/audit-logs.component').then(m => m.AuditLogsComponent) }`.

---

## Phase 2: Core Implementation

- [x] 2.1 **RED** — Create failing unit test `frontend/src/app/features/admin/audit-logs/audit-logs.component.spec.ts`: verifies component calls `getAuditLogs({ page: 1, limit: 20 })` on init; renders one `<tr>` per item; shows empty-state message when `items: []`; pagination change calls service again with new page; filter application resets page to 1. Spec scenarios: "Table renders on load" (R2-S1), "Empty state" (R2-S2), "Pagination navigates pages" (R2-S3), "Filters reset pagination" (R3-S4).
- [x] 2.2 **GREEN** — Create `frontend/src/app/features/admin/audit-logs/audit-logs.component.ts` — standalone, `imports: [CommonModule, RouterModule, FormsModule]`, signals for `items`, `total`, `currentPage`, `filters`, `users`, `actorDropdownAvailable`. `ngOnInit()` calls `loadData()` + `loadUsers()`. `loadData()` calls service, updates signals. `loadUsers()` calls `getUsers()`, catches 403 and sets `actorDropdownAvailable = false`.
- [x] 2.3 Create `frontend/src/app/features/admin/audit-logs/audit-logs.component.html` — filter bar (two `<input type="date">` for `date_from`/`date_to`; conditional `<select>` for actor dropdown OR `<input type="text">` UUID fallback based on `actorDropdownAvailable`); `<table>` with columns: `Fecha`, `Usuario (actor)`, `Acción`, `Recurso`, `Recurso ID`, `Justificación`; `<app-pagination>` wired to `total` and `currentPage`; "Descargar CSV" `<button>` calling `onDownloadCsv()`. Include empty-state `<div>` when `items().length === 0`.
- [x] 2.4 **RED** — Add failing test to `audit-logs.component.spec.ts`: clicking "Descargar CSV" calls `service.exportCsv(activeFilters)` and triggers blob download via `URL.createObjectURL` (spy on `URL.createObjectURL`). Spec scenario: "CSV download triggered" (R4-S1), "CSV download with no filters" (R4-S2).
- [x] 2.5 **GREEN** — Implement `onDownloadCsv()` in `audit-logs.component.ts`: call `service.exportCsv(activeFilters).subscribe(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = \`audit-logs-${dateStr}.csv\`; a.click(); URL.revokeObjectURL(url); })`.
- [x] 2.6 **RED** — Add failing test to `audit-logs.component.spec.ts`: actor dropdown shows when `getUsers()` resolves; UUID text input shown when service throws 403. Spec scenario: "Actor filter narrows results" (R3-S2).
- [x] 2.7 **GREEN** — Wire actor dropdown/fallback in component: if `actorDropdownAvailable`, render `<select>` bound to `filters.actor_id`; else render `<input type="text">`.

---

## Phase 3: Integration / Wiring

- [x] 3.1 Modify `frontend/src/app/features/admin/users/users-list/users-list.component.html` — replace `href="#"` on the "Auditoría de Acceso" card with `[routerLink]="['/app/admin/audit-logs']"`. Spec scenarios: "Card navigates to audit-logs" (R5-S1), "No stale href='#'" (R5-S2).
- [x] 3.2 **RED** — Add test to `audit-logs.component.spec.ts` for route guard: setup `RouterTestingModule` with the audit-logs route; navigating without permission triggers guard redirect. Spec scenario: "Permission guard blocks unauthorized user" (R1-S2).
- [x] 3.3 **GREEN** — Confirm `permissionGuard` reads `route.data['permission']` as `'READ audit-logs'` — verify the route definition added in 1.4 matches the guard's expected format (no code change if already correct; document if a format mismatch is found).

---

## Phase 4: Testing / Verification

- [x] 4.1 Run `cd frontend && ng test --include=**/audit-logs*` — all audit-logs unit specs green.
- [x] 4.2 Run `npm run lint` (frontend) — no ESLint errors in created/modified files.
- [x] 4.3 Run `npm run typecheck` (frontend) — no TypeScript errors from component, service, or route definition.
- [x] 4.4 Manual smoke test: navigate to `/app/admin/audit-logs` as master user — table loads, filters work, CSV download prompts file save, breadcrumb reads `Auditoría de Acceso`.
- [x] 4.5 Verify `users-list` card navigates to `/app/admin/audit-logs` without full-page reload (Angular router handles navigation, spec scenario R5-S1).
