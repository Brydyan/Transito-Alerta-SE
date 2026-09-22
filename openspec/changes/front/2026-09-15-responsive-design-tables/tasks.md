# Tasks: Responsive Tables → Mobile Card View

**Change**: `front/2026-09-15-responsive-design-tables`
**Scope**: Frontend (Angular 21 standalone, Tailwind v4, Jest 30.4.2 + Playwright)
**Date**: 2026-09-15
**Stack**: Angular 21 standalone · Tailwind v4 ^4.3.3 · Jest 30.4.2 (`pnpm test` from `frontend/`) · Playwright (e2e) · `pnpm run build`

---

## Batches

Implementation is split into **6 apply batches** of 2–3 consecutive design phases each. Batching follows **dependency coherence**, not blind numeric slicing — each batch is independently buildable, testable, and reviewable at ≤400 changed lines (see Review Workload Forecast).

| Batch | Design phases | Rationale — why these phases belong together | Primary spec coverage |
|-------|---------------|----------------------------------------------|-----------------------|
| **Batch 1 — Foundation** | **D1 + D2 + D3 + D12** | Component skeleton + reactive viewport core. `DataCard` (D12) is the internal leaf of `TableToCard` (D1); `LayoutService.isSmallViewport` (D2) is the reactive switch both `TableToCard` and `DataCard` depend on; `cardFields` config (D3) defines the 3-field contract `DataCard` renders. No integration into list pages yet — pure shared primitives. | S2.2 (3 fields), S2.5/S7.3 (spacing tokens), S7.1 (breakpoint constant), S8.3 (card semantics prep) |
| **Batch 2 — Actions** | **D4 + D8** | Both govern the **card chrome**: kebab dropdown (D4) and the always-visible primary action (D8). They share the same touch-target, a11y, and dismissal concerns; shipping together avoids revisiting card footer twice. First pilot integration: `IncidentsListComponent` (S9.1) validates the reusable contract end-to-end. | S2.3, S2.4, S6.1–S6.4, S8.2, S9.1 |
| **Batch 3 — Data loading & filtering** | **D5 + D6** | Both are **stateful list behaviours** that sit above the card grid: manual infinite scroll (D5) and collapsible filter drawer (D6). They share pagination/filter-state wiring; integrating `UsersListComponent` + `RolesComponent` (S9.2–S9.3) proves both together. | S3.2–S3.5, S4.2–S4.5, S9.2–S9.3 |
| **Batch 4 — Layout & persistence** | **D7 + D9 + D13** | **CSS + state persistence** cluster. Grid responsive columns (D7) and breakpoint definitions (D13) both touch `frontend/src/styles/_tables.css` + `frontend/src/styles/_layout.css` and would conflict if split; localStorage persistence (D9) is the last state layer before polish. Integrates the two remaining tables `OrganizationListComponent` + `CategoryListComponent` (S9.4–S9.5) and completes R1 desktop-vs-card switching. | S1.1–S1.2, S2.1, S5.2, S7.1–S7.3, S9.4–S9.5, S10.1–S10.2 |
| **Batch 5 — Polish** | **D10 + D11** | Both are **visual-quality / a11y** passes over already-integrated cards: touch sizing (D10) and CLS/skeleton stability (D11). They touch the same card styles and are best verified together via a11y + Lighthouse audit. | S5.1, S6.2, S7.2–S7.3, S8.1–S8.4 |
| **Batch 6 — Navigation** | **D14** | Standalone **router-level** concern (scroll restoration). Depends on all lists being card-capable but touches only `frontend/src/app/app.config.ts` + per-list scroll hooks. Smallest, independently shippable batch. | S5.3 |

**Ordering invariant**: Batches execute strictly 1→6. Each batch's `isSmallViewport$` / `DataCard` / `TableToCard` contract is the prerequisite for every later batch. Intermediate batches are demo-able with subset tables; coverage expands monotonically to all 5 tables by end of Batch 4.

---

## Review Workload Forecast (summary — see detailed forecast at end)

| Field | Value |
|-------|-------|
| Estimated changed lines | **~1,650–1,950** (authored) |
| 400-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Suggested split | **6 chained PRs (one per batch above)** |
| Delivery strategy | `ask-on-risk` |
| Chain strategy | `feature-branch-chain` (tracker: `feat/responsive-tables`) → `pending` until user confirms |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Shared card primitives: `DataCard`, `TableToCard` skeleton, `LayoutService.isSmallViewport$`, `cardFields` config | PR 1 → `feat/responsive-tables` | `pnpm test -- table-to-card data-card layout.service` (Jest, from `frontend/`) | `pnpm run build` + manual resize <1024px check on `/app/incidencias` (no integration yet — cards render in Storybook/isolation) | Delete `frontend/src/app/shared/components/table-to-card/**`, `frontend/src/app/shared/components/data-card/**`; revert `frontend/src/app/core/services/layout.service.ts` |
| 2 | Card chrome: `ActionDropdown` + "Ver detalle" prominence; pilot integration on Incidents | PR 2 → PR 1 branch | `pnpm test -- action-dropdown table-to-card incident-list` | `pnpm run build`; click ⋮ + "Ver detalle" on incidents card at 375px and 768px | Revert `frontend/src/app/shared/components/action-dropdown/**`, `frontend/src/app/features/incidents/incident-list/**` card wiring |
| 3 | List behaviours: "Ver más datos" infinite scroll + `FilterDrawer`; integrate Users + Roles | PR 3 → PR 2 branch | `pnpm test -- filter-drawer incident-list users-list roles` | `pnpm run build`; load more + open/close drawer on users/roles at <1024px; Esc / outside-click dismiss | Revert `frontend/src/app/shared/components/filter-drawer/**`, `frontend/src/app/features/admin/users/**`, `frontend/src/app/features/admin/roles/**` responsive edits |
| 4 | Layout system: grid CSS + breakpoint tokens + localStorage persistence; integrate Orgs + Categories | PR 4 → PR 3 branch | `pnpm test -- layout.service table-to-card organization-list category-list` | `pnpm run build`; verify 1-col @640px, 2-col @768px, table @1024px; filter persistence across route | Revert `frontend/src/styles/_tables.css`, `frontend/src/styles/_layout.css`, storage edits in org/category lists |
| 5 | A11y & performance polish: 44px targets + CLS/skeletons + text/spacing scales | PR 5 → PR 4 branch | `pnpm test -- data-card action-dropdown table-to-card` + `npx playwright test --grep responsive` (if present) | `pnpm run build`; Lighthouse mobile ≥80, axe-core no violations, no layout shift on append | Revert style touch-target / skeleton / typography edits only |
| 6 | Scroll restoration on detail→back | PR 6 → PR 5 branch | `pnpm test -- app.config incident-list` | `pnpm run build`; scroll to card #15 → Ver detalle → back → position restored | Revert `frontend/src/app/app.config.ts` scroll config + per-list restore hooks |

---

## Batch 1 — Foundation: TableToCard skeleton + LayoutService + card field config + DataCard (D1, D2, D3, D12)

### T-01 — Extend LayoutService with isSmallViewport$ (D2) — RED

- [x] **T-01**: Write failing unit tests for `LayoutService.isSmallViewport$` reactive viewport detection.

  **Scope**: Tests only.
  **Files**: `frontend/src/app/core/services/layout.service.spec.ts` (new or extend existing)
  **Done criteria**:
  - Tests assert: emits `true` when `window.innerWidth < 1024`, `false` when ≥1024; debounces resize events (200ms); uses `shareReplay(1)`.
  - Tests currently **fail** (signal/observable not yet implemented).
  - Covers S7.1 breakpoint constant (lg=1024).

### T-02 — Extend LayoutService with isSmallViewport$ (D2) — GREEN

- [x] **T-02**: Implement `LayoutService.isSmallViewport$` observable/signal.

  **Scope**: Service only.
  **Files**: `frontend/src/app/core/services/layout.service.ts`
  **Done criteria**:
  - `breakpoint = 1024` private readonly; exposes `isSmallViewport$` (or `isSmallViewport` signal) derived from `window.resize` with `debounceTime(200)` + `shareReplay(1)` / `computed` equivalent.
  - `T-01` tests now **pass**: `pnpm test -- layout.service` green.
  - Does not break `sidebarOpen` signal contract; existing consumers unaffected.

### T-03 — Create DataCardComponent internal leaf (D12) — RED

- [x] **T-03**: Write failing unit tests for `DataCardComponent` (internal card used by TableToCard).

  **Scope**: Tests only.
  **Files**: `frontend/src/app/shared/components/data-card/data-card.component.spec.ts` (new)
  **Done criteria**:
  - Tests assert: renders exactly 3 fields from `@Input() fields: {key,label,format?}[]` via `@Input() data`; `format: 'badge' | 'priority-badge' | null` applies correct badge variant; truncated `descripcion` (S2.2 categories); `icon` field renders `UiIconComponent` or `img`; emits `detailClicked` and `actionClicked`; has `role="article"` / `aria-label` with `S8.3` announcement contract.
  - Tests currently **fail**.
  - Covers S2.2 (all 5 table field mappings) and S8.3.

### T-04 — Create DataCardComponent internal leaf (D12) — GREEN

- [x] **T-04**: Implement `DataCardComponent` (standalone, OnPush, Tailwind).

  **Scope**: Component implementation.
  **Files**: `frontend/src/app/shared/components/data-card/data-card.component.ts` (new), `frontend/src/app/shared/components/data-card/index.ts` (new)
  **Done criteria**:
  - Inputs: `data`, `fields`, `actions`; Outputs: `detailClicked`, `actionClicked`; uses `UiBadgeComponent` for status/priority, `UiIconComponent` for category icon.
  - Card padding `p-4` (1rem), gap tokens per S2.5; truncation logic for long `descripcion`.
  - `T-03` tests now **pass**; `pnpm test -- data-card` green.
  - `pnpm run build` succeeds.

### T-05 — Define cardFields configs for all 5 tables (D3) — RED

- [x] **T-05**: Write failing tests asserting `cardFields` config shape per table (spec S2.2 / S9.1–S9.5).

  **Scope**: Tests only — validates the config contract, not rendering.
  **Files**: `frontend/src/app/shared/components/table-to-card/card-fields.spec.ts` (new) or co-located `card-fields-config.spec.ts`
  **Done criteria**:
  - Tests assert exported configs: `INCIDENTS_CARD_FIELDS = [{key:'title',...},{key:'status',format:'badge'},...]` etc. for users `{nombre,email,rol}`, roles `{nombre,permisos count,usuarios count}`, orgs `{nombre,zona,usuarios count}`, categories `{nombre,descripcion,icon}`; each exactly 3 entries; `key` must exist on corresponding model.
  - Tests currently **fail**.

### T-06 — Define cardFields configs for all 5 tables (D3) — GREEN

- [x] **T-06**: Implement `cardFields` config factory/constant.

  **Scope**: Config module.
  **Files**: `frontend/src/app/shared/components/table-to-card/card-fields.ts` (new) (or `card-config.ts`)
  **Done criteria**:
  - Exports `CardField = {key:string; label:string; format?: 'badge'|'priority-badge'|null}` and the 5 preset arrays.
  - `T-05` tests now **pass**.
  - No hardcoded field names inside `TableToCard`/`DataCard` — they consume this config.

### T-07 — Create TableToCardComponent skeleton (D1) — RED

- [x] **T-07**: Write failing unit tests for `TableToCardComponent` responsive switching.

  **Scope**: Tests only.
  **Files**: `frontend/src/app/shared/components/table-to-card/table-to-card.component.spec.ts` (new)
  **Done criteria**:
  - Tests assert: when `isSmallViewport$=true`, table wrapper hidden (`hidden` class) and card grid `grid grid-cols-1 md:grid-cols-2 gap-4` visible with `@for (item of items; track item.id)` rendering `app-data-card` per item; when `false`, card grid hidden and `<ng-content>` `ui-table` visible; `@Input() items`, `cardFields`, `cardActions`, `detailRoute` wired; OnPush.
  - Tests currently **fail**.
  - Covers S1.1, S2.1, S7.1.

### T-08 — Create TableToCardComponent skeleton (D1) — GREEN

- [x] **T-08**: Implement `TableToCardComponent` skeleton (no ActionDropdown/FilterDrawer yet — stubbed slots).

  **Scope**: Component implementation.
  **Files**: `frontend/src/app/shared/components/table-to-card/table-to-card.component.ts` (new), `frontend/src/app/shared/components/table-to-card/index.ts` (new)
  **Done criteria**:
  - Standalone, `imports: [CommonModule, DataCardComponent]`; template uses `isSmallViewport$ | async` (or signal) to toggle card-grid vs `<ng-content>` `ui-table`; grid classes `grid grid-cols-1 md:grid-cols-2 gap-4`.
  - Injects `LayoutService`.
  - `T-07` tests now **pass**; `pnpm test -- table-to-card` green.
  - `pnpm run build` succeeds. No list-component integration in this batch.

---

## Batch 2 — Actions: ActionDropdown + Ver detalle prominence (D4, D8)

### T-09 — Create ActionDropdownComponent (D4) — RED

- [ ] **T-09**: Write failing unit tests for `ActionDropdownComponent` (kebab ⋮).

  **Scope**: Tests only.
  **Files**: `frontend/src/app/shared/components/action-dropdown/action-dropdown.component.spec.ts` (new)
  **Done criteria**:
  - Tests assert: renders trigger button `aria-label="More actions"` with ⋮; closed by default; click toggles `isOpen`; renders `@for (action of actions)` items with `action.label`; `actionSelected` emits on click and closes dropdown; click-outside / Esc closes; items have `min-h-[44px]` (S6.2/S8.2); dropdown repositions if near viewport edge (S6.1 — at least not rendering off-screen / `right-0`).
  - Tests currently **fail**.
  - Covers S2.4, S6.1, S6.2, S6.4, S8.2, S8.4.

### T-10 — Create ActionDropdownComponent (D4) — GREEN

- [ ] **T-10**: Implement `ActionDropdownComponent` (standalone, OnPush).

  **Scope**: Component implementation.
  **Files**: `frontend/src/app/shared/components/action-dropdown/action-dropdown.component.ts` (new), `frontend/src/app/shared/components/action-dropdown/index.ts` (new), uses `frontend/src/app/shared/directives/click-outside.directive.ts` (read-only if reused)
  **Done criteria**:
  - Template: trigger `button.p-2 hover:bg-gray-100 rounded` + conditional absolute `w-48 bg-white rounded shadow-lg z-50 right-0 mt-2`; items `block w-full text-left px-4 py-2 hover:bg-gray-100 min-h-[44px]`; handles `Esc` + `clickOutside`; reuses `ClickOutsideDirective` where applicable.
  - `T-09` tests now **pass**; a11y: focus ring visible (S8.1), no hover-only content (S8.4).
  - `pnpm run build` succeeds.

### T-11 — Wire "Ver detalle" prominence into DataCard/TableToCard (D8) — RED

- [ ] **T-11**: Write failing tests for "Ver detalle" button always visible on card footer (D8).

  **Scope**: Tests only (extends DataCard/TableToCard specs).
  **Files**: `frontend/src/app/shared/components/data-card/data-card.component.spec.ts`, `frontend/src/app/shared/components/table-to-card/table-to-card.component.spec.ts`
  **Done criteria**:
  - Tests assert: card footer contains `button` with text `Ver detalle` (`flex-1 btn-primary` or `ui-button` equivalent) **always visible** (not inside dropdown); clicking it emits `detailClicked` with item; `ActionDropdown` sits adjacent in `flex gap-2` row; card itself is also clickable forwarding to detail (optional but tested if implemented).
  - Tests currently **fail**.
  - Covers S2.3, S2.4, S8.2.

### T-12 — Wire "Ver detalle" prominence into DataCard/TableToCard (D8) — GREEN

- [ ] **T-12**: Implement prominent "Ver detalle" button in `DataCardComponent` footer.

  **Scope**: Component template/styles.
  **Files**: `frontend/src/app/shared/components/data-card/data-card.component.ts`, `frontend/src/app/shared/components/table-to-card/table-to-card.component.ts` (slot wiring)
  **Done criteria**:
  - Footer: `<div class="mt-4 flex gap-2"><button class="flex-1" (click)="onDetail(item)">Ver detalle</button><app-action-dropdown></app-action-dropdown></div>`.
  - `UiButtonComponent` used if available; Spanish label preserved per UI copy contract.
  - `T-11` tests now **pass**.

### T-13 — Pilot integration: IncidentsListComponent → TableToCard (D1, D8) — RED

- [ ] **T-13**: Write failing integration tests for `IncidentListComponent` rendering cards on mobile.

  **Scope**: Tests only.
  **Files**: `frontend/src/app/features/incidents/incident-list/incident-list.component.spec.ts` (extend)
  **Done criteria**:
  - Tests assert (viewport <1024): incidents render as cards (not `<table>`); each card shows `title | status badge | priority badge` (S9.1); "Ver detalle" + ⋮ present; ⋮ menu contains `Edit`, `Delete`, `claim/release/close` per permission-gated actions; dropdown delete → `ConfirmDialogService` (S6.3); selection closes dropdown (S6.4).
  - Tests currently **fail**.
  - Covers S2.1, S2.2 (incidents), S2.3, S2.4, S6.3, S6.4, S9.1.

### T-14 — Pilot integration: IncidentsListComponent → TableToCard (D1, D8) — GREEN

- [ ] **T-14**: Migrate `IncidentListComponent` to use `TableToCardComponent` + `DataCard` + `ActionDropdown`.

  **Scope**: Feature component wiring.
  **Files**: `frontend/src/app/features/incidents/incident-list/incident-list.component.ts`, `frontend/src/app/features/incidents/incident-list/incident-list.component.html`
  **Done criteria**:
  - Imports `TableToCardComponent`; provides `cardFields = INCIDENTS_CARD_FIELDS`, `cardActions` derived from `permissions` computed; delegates `detailClicked` to `goToDetail()`, `actionClicked` to existing service calls; preserves query-param filter + pagination desktop path (S1.1, S3.1).
  - Template wraps `ui-table` with `<table-to-card [items]="incidents()" [cardFields]="...">` fallback via `ng-content` for desktop (S1.1).
  - `T-13` tests now **pass**; `pnpm test -- incident-list` green; `pnpm run build` succeeds.

---

## Batch 3 — Data loading & filtering: Infinite scroll + FilterDrawer (D5, D6)

### T-15 — Implement "Ver más datos" infinite scroll trigger (D5) — RED

- [ ] **T-15**: Write failing tests for manual infinite scroll ("Ver más datos") on mobile.

  **Scope**: Tests only.
  **Files**: `frontend/src/app/shared/components/table-to-card/table-to-card.component.spec.ts` (extend) and `frontend/src/app/features/incidents/incident-list/incident-list.component.spec.ts` (extend)
  **Done criteria**:
  - Tests assert: when `isSmallViewport=true`, "Ver más datos" button appears below card grid (S3.2) with `hidden lg:hidden`; button hidden on desktop (S3.1); clicking calls `loadMoreData()` → appends `new items` via `this.items = [...this.items, ...data.items]` (S3.2); while fetch in flight button shows `Cargando...` spinner and is disabled (S3.3); no auto-load on scroll without click (S3.4); when `hasMore=false` button hidden/disabled and optional `No hay más datos` shown (S3.5).
  - Tests currently **fail**.
  - Covers S3.1–S3.5, S5.1 (no shift on append).

### T-16 — Implement "Ver más datos" infinite scroll trigger (D5) — GREEN

- [ ] **T-16**: Implement `loadMoreData()` + "Ver más datos" button (manual, no auto-load).

  **Scope**: Shared + feature logic.
  **Files**: `frontend/src/app/shared/components/table-to-card/table-to-card.component.ts` (button + `hasMore`/`isLoading` inputs/outputs), `frontend/src/app/features/incidents/incident-list/incident-list.component.ts` (pagination state: `currentPage`, `pageSize`, `hasMore`, `isLoadingMore`)
  **Done criteria**:
  - Shared component exposes `@Input() hasMore`, `@Input() isLoadingMore`, `@Output() loadMore`; button `hidden lg:block` inverted to `block lg:hidden` for mobile-only.
  - List component: `loadMoreData()` increments `currentPage`, calls `incidentService.list({page})`, appends items, sets `hasMore = data.items.length === pageSize`.
  - `T-15` tests now **pass**; desktop pagination (S3.1) untouched (rendered via `ui-table` branch).

### T-17 — Create FilterDrawerComponent (D6) — RED

- [ ] **T-17**: Write failing tests for `FilterDrawerComponent` mobile collapsible.

  **Scope**: Tests only.
  **Files**: `frontend/src/app/shared/components/filter-drawer/filter-drawer.component.spec.ts` (new)
  **Done criteria**:
  - Tests assert: desktop (`isSmallViewport=false`) → `<ng-content>` filters visible always, no "Filtros" button (S4.1); mobile → filters hidden, "Filtros" button visible (S4.2); click "Filtros" slides drawer with overlay `fixed inset-0 bg-black/30 z-40` + panel `fixed left-0 top-0 bottom-0 w-64 bg-white shadow-lg z-50` (S4.3); filter change applies immediately (no Apply button) and drawer stays open (S4.4); Esc / outside-click / "Cerrar" closes drawer (S4.5); keyboard focus trap / focus ring (S8.1).
  - Tests currently **fail**.
  - Covers S4.1–S4.5.

### T-18 — Create FilterDrawerComponent (D6) — GREEN

- [ ] **T-18**: Implement `FilterDrawerComponent` (standalone, OnPush).

  **Scope**: Component implementation.
  **Files**: `frontend/src/app/shared/components/filter-drawer/filter-drawer.component.ts` (new), `frontend/src/app/shared/components/filter-drawer/index.ts` (new)
  **Done criteria**:
  - Uses `LayoutService.isSmallViewport$` to switch desktop inline vs mobile drawer; `isOpen` signal; overlay click + `Escape` HostListener + close button; Tailwind only; z-index managed.
  - `T-17` tests now **pass**.

### T-19 — Integrate UsersListComponent + RolesComponent: cards + load-more + drawer (S9.2–S9.3) — RED

- [ ] **T-19**: Write failing integration tests for Users + Roles mobile cards.

  **Scope**: Tests only.
  **Files**: `frontend/src/app/features/admin/users/users-list/users-list.component.spec.ts` (extend), `frontend/src/app/features/admin/roles/roles.component.spec.ts` (extend)
  **Done criteria**:
  - Tests assert: Users cards show `nombre | email | rol` + detail + ⋮ (`edit/delete/permissions`) (S9.2); Roles cards show `nombre | [N] permisos | [N] usuarios` + detail + ⋮ (S9.3); mobile uses card grid + "Ver más datos" append; `FilterDrawer` wraps `SearchBarComponent` + `FilterBarComponent` (users) / `SearchBarComponent` (roles); desktop still shows `ui-table` + inline filters (S4.1) + classic pagination (S3.1).
  - Tests currently **fail**.

### T-20 — Integrate UsersListComponent + RolesComponent: cards + load-more + drawer (S9.2–S9.3) — GREEN

- [ ] **T-20**: Migrate `UsersListComponent` + `RolesComponent` to `TableToCard` + `FilterDrawer` + load-more.

  **Scope**: Feature components.
  **Files**: `frontend/src/app/features/admin/users/users-list/users-list.component.ts`, `frontend/src/app/features/admin/users/users-list/users-list.component.html`, `frontend/src/app/features/admin/roles/roles.component.ts`, `frontend/src/app/features/admin/roles/roles.component.html`
  **Done criteria**:
  - Both import `TableToCardComponent`, `FilterDrawerComponent`, `DataCardComponent` wiring; provide correct `cardFields` presets; wire `hasMore`/`isLoadingMore`/`loadMore` to existing `UsersService`/`RolesService` paginated `list`/`getUsers`/`getRoles`; `FilterDrawer` projects existing search/filter bars via `<ng-content>`.
  - Desktop path preserved (no regression on `visibleUsers`/`visibleRoles` computed, `pageRange`, `shouldShowPagination`).
  - `T-19` tests now **pass**; `pnpm run build` succeeds.

---

## Batch 4 — Layout & persistence: grid CSS + localStorage + breakpoints (D7, D9, D13)

### T-21 — Define card grid responsive CSS + breakpoint tokens (D7, D13) — RED

- [ ] **T-21**: Write failing tests for responsive grid/breakpoint contract (D7 + D13).

  **Scope**: Tests / style contract tests.
  **Files**: `frontend/src/app/shared/components/table-to-card/table-to-card.component.spec.ts` (grid class assertions), `frontend/src/app/layout/layout-tokens.regression.spec.ts` (extend if exists) or `frontend/src/styles/_tables.css.spec.ts` (new regression spec reading computed styles)
  **Done criteria**:
  - Tests assert: card grid element has `grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6`; `hidden lg:block` / `block lg:hidden` toggling at 1024px (S2.1, S7.1); spacing scales: sm `gap 0.5rem`, md `gap 1rem`, lg+ `gap 1.5rem` (S7.3); breakpoint values `sm:640 md:768 lg:1024 xl:1280 2xl:1536` with no custom breakpoints (S7.1); desktop shows `ui-table` with sticky header `sticky top-0` (S1.2) and mobile hides header (D7).
  - Tests currently **fail**.

### T-22 — Implement card grid responsive CSS + breakpoint tokens (D7, D13) — GREEN

- [ ] **T-22**: Apply grid CSS + breakpoint definitions (Tailwind standard, no new config).

  **Scope**: Styles + component class wiring.
  **Files**: `frontend/src/styles/_tables.css`, `frontend/src/styles/_layout.css`, `frontend/src/app/shared/components/table-to-card/table-to-card.component.ts` (grid classes), `frontend/src/app/shared/components/ui-table/ui-table.component.ts` (sticky header class)
  **Done criteria**:
  - `_tables.css`: `@layer components` card-grid rules with Tailwind tokens; `_layout.css` breakpoint comments/overrides only if needed; no custom Tailwind config.
  - `ui-table` header gets `sticky top-0 z-10` on desktop branch; hidden on mobile card branch.
  - `T-21` tests now **pass**; progressive enhancement: `overflow-x-auto` fallback (S10.1–S10.2) preserved.

### T-23 — Implement localStorage sort/filter persistence (D9) — RED

- [ ] **T-23**: Write failing tests for filter/sort persistence via localStorage (D9).

  **Scope**: Tests only.
  **Files**: `frontend/src/app/features/incidents/incident-list/incident-list.component.spec.ts` (extend), `frontend/src/app/features/admin/users/users-list/users-list.component.spec.ts` (extend)
  **Done criteria**:
  - Tests assert: on filter change `localStorage.setItem('{table}-filters', JSON.stringify(filters))` called (keys: `incidents-filters`, `users-filters`, etc.); `ngOnInit` hydrates from `localStorage.getItem` before `loadData`; `loadData` respects hydrated filters; query-param compat preserved where already used (D2 decision note).
  - Tests currently **fail**.
  - Covers S5.2.

### T-24 — Implement localStorage sort/filter persistence (D9) — GREEN

- [ ] **T-24**: Wire localStorage persistence per table list.

  **Scope**: Feature components.
  **Files**: `frontend/src/app/features/incidents/incident-list/incident-list.component.ts`, `frontend/src/app/features/admin/users/users-list/users-list.component.ts`, `frontend/src/app/features/admin/roles/roles.component.ts` (and `frontend/src/app/features/catalogs/organizations/organization-list/organization-list.component.ts` + `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.ts` if migrated this batch)
  **Done criteria**:
  - `onFilterChange` writes to `localStorage`; `ngOnInit` reads with fallback to `DEFAULT_FILTERS`; no query-param churn beyond existing D2 flow; `T-23` tests now **pass**.

### T-25 — Integrate OrganizationListComponent + CategoryListComponent (S9.4–S9.5) — RED

- [ ] **T-25**: Write failing integration tests for Orgs + Categories mobile cards.

  **Scope**: Tests only.
  **Files**: `frontend/src/app/features/catalogs/organizations/organization-list/organization-list.component.spec.ts` (extend or create), `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.spec.ts` (extend or create)
  **Done criteria**:
  - Tests assert: Orgs card `nombre | zoneNames.get(zone_id) | [N] usuarios` + actions `edit/delete/assign-category` (S9.4); Categories card `nombre | descripcion (truncated) | icon` + actions `edit/delete` (S9.5); card grid + "Ver más datos" + `FilterDrawer` wrapping search; desktop table path unchanged (S1.1, S3.1).
  - Tests currently **fail**.

### T-26 — Integrate OrganizationListComponent + CategoryListComponent (S9.4–S9.5) — GREEN

- [ ] **T-26**: Migrate `OrganizationListComponent` + `CategoryListComponent` to full responsive contract.

  **Scope**: Feature components.
  **Files**: `frontend/src/app/features/catalogs/organizations/organization-list/organization-list.component.ts`, `frontend/src/app/features/catalogs/organizations/organization-list/organization-list.component.html`, `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.ts`, `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.html`
  **Done criteria**:
  - Both import `TableToCardComponent` + `FilterDrawerComponent`; provide correct `cardFields`; `zoneNames` signal still resolves via `get(zone_id)` inside card field formatter; truncated `descripcion` + `icon` via `DataCard` format branch; `ConfirmDialogService` preserved for delete (S6.3); desktop `ui-table` branch retains `HasPermissionDirective` where already used.
  - `T-25` tests now **pass**; all 5 tables now responsive → R9 fully satisfied.

---

## Batch 5 — Polish: touch sizing + CLS/no-shift (D10, D11)

### T-27 — Enforce touch-friendly sizing ≥44px (D10) — RED

- [ ] **T-27**: Write failing a11y/touch-target tests for ≥44x44px interactive elements.

  **Scope**: Tests only.
  **Files**: `frontend/src/app/shared/components/data-card/data-card.component.spec.ts`, `frontend/src/app/shared/components/action-dropdown/action-dropdown.component.spec.ts`, `frontend/src/app/shared/components/filter-drawer/filter-drawer.component.spec.ts`
  **Done criteria**:
  - Tests assert: "Ver detalle" button, ⋮ trigger, dropdown items, "Filtros" button, "Ver más datos" button all have `min-h-[44px] min-w-[44px]` (or computed height ≥44px via `getBoundingClientRect`); `dropdown-item` has `py-2 px-3 min-h-[44px]`; `btn-mobile` class `h-11` present; no tap target below 44px in card footer.
  - Tests currently **fail**.
  - Covers S6.2, S8.2.

### T-28 — Enforce touch-friendly sizing ≥44px (D10) — GREEN

- [ ] **T-28**: Apply `min-h-[44px]` touch targets across cards and controls.

  **Scope**: Styles/templates.
  **Files**: `frontend/src/app/shared/components/data-card/data-card.component.ts`, `frontend/src/app/shared/components/action-dropdown/action-dropdown.component.ts`, `frontend/src/app/shared/components/filter-drawer/filter-drawer.component.ts`, `frontend/src/styles/_tables.css` (if shared `btn-mobile`/`dropdown-item` utilities)
  **Done criteria**:
  - All interactive elements get `min-h-[44px]` / `h-11 px-4 py-2` utilities; `T-27` tests now **pass**; visual regression: finger-size comfort at 375px verified via manual `pnpm run build` + DevTools device mode.

### T-29 — Guarantee no layout shift / CLS stability (D11) — RED

- [ ] **T-29**: Write failing tests for CLS / skeleton / stable scroll on append (D11).

  **Scope**: Tests only.
  **Files**: `frontend/src/app/shared/components/table-to-card/table-to-card.component.spec.ts` (extend), `frontend/src/app/shared/components/table-skeleton/table-skeleton.component.spec.ts` (extend if used for cards)
  **Done criteria**:
  - Tests assert: while `isLoading`/`isLoadingMore`, skeleton `animate-pulse h-64 bg-gray-200 rounded` shown instead of empty grid; images (category `icon` or incident images if any) have `aspect-video object-cover` or fixed height to pre-allocate space; appending via `loadMoreData` does not shift existing card DOM order (snapshot before/after); `S5.1` no-shift contract.
  - Tests currently **fail**.
  - Covers S5.1, D11.

### T-30 — Guarantee no layout shift / CLS stability (D11) — GREEN

- [ ] **T-30**: Implement skeletons + aspect-ratio guards.

  **Scope**: Component templates/styles.
  **Files**: `frontend/src/app/shared/components/data-card/data-card.component.ts`, `frontend/src/app/shared/components/table-to-card/table-to-card.component.ts`, `frontend/src/app/shared/components/table-skeleton/table-skeleton.component.ts` (card-skeleton variant if reused), `frontend/src/styles/_tables.css`
  **Done criteria**:
  - Card image slots use `aspect-video` or `min-h` container; loading state renders pulse skeleton with fixed `h-64`; `T-29` tests now **pass**.
  - Also covers responsive text sizing (S7.2) + spacing scale (S7.3) if not already satisfied in T-22: title `text-base` (1rem) on sm vs `text-lg` on desktop, metadata `text-sm` (0.875rem).

### T-31 — Accessibility audit pass (S8.1–S8.4) — RED + GREEN

- [ ] **T-31**: Add/extend a11y tests and apply fixes for focus, screen-reader, hover-only content.

  **Scope**: Tests + fixes.
  **Files**: `frontend/src/app/shared/components/data-card/data-card.component.spec.ts` (a11y block), `frontend/src/app/shared/components/action-dropdown/action-dropdown.component.spec.ts`, `frontend/src/app/shared/components/contrast.regression.spec.ts` (extend if present)
  **Done criteria**:
  - Tests assert: focus ring visible on card/button receive focus (`focus-visible` class / ring utilities, contrast ≥3:1) (S8.1); all touch targets ≥44px re-asserted; `DataCard` has `aria-label="Card: {{title}}, {{field1}}: {{value1}}, {{field2}}: {{value2}}, Actions: {{count}}"` (S8.3); no critical content hidden behind `:hover` (S8.4) — menu requires tap not hover.
  - Fixes applied; `pnpm test` green; manual axe-core check no violations on card grid route.

---

## Batch 6 — Navigation: scroll restoration (D14)

### T-32 — Enable scroll position restoration (D14) — RED

- [ ] **T-32**: Write failing tests for scroll restoration on detail→back.

  **Scope**: Tests only.
  **Files**: `frontend/src/app/app.config.spec.ts` (new or extend) and `frontend/src/app/features/incidents/incident-list/incident-list.component.spec.ts` (scroll-restore unit)
  **Done criteria**:
  - Tests assert: `appConfig` provides `withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })` or `withScrollPositionRestoration('enabled')` depending on Angular 21 API; list component saves scroll offset to `localStorage` or `sessionStorage` on `goToDetail` and restores on `ngOnInit` / `NavigationEnd`; scroll position returns approx. to card #15 area after Ver detalle → modal/back.
  - Tests currently **fail**.
  - Covers S5.3.

### T-33 — Enable scroll position restoration (D14) — GREEN

- [ ] **T-33**: Wire scroll restoration (Router + localStorage fallback).

  **Scope**: App config + feature hooks.
  **Files**: `frontend/src/app/app.config.ts`, `frontend/src/app/features/incidents/incident-list/incident-list.component.ts` (and optionally other 4 lists for fallback), `frontend/src/app/app.routes.ts` (read-only if inspecting)
  **Done criteria**:
  - `app.config.ts`: `provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }))` (or `withScrollPositionRestoration('enabled')` if that is the Angular 21 re-export); localStorage fallback `scroll-{table}` key for critical lists (incidents) as backup.
  - `T-32` tests now **pass**; no regression on existing `provideRouter(routes, withComponentInputBinding())` — merged correctly.

### T-34 — Final responsive verification gate (all tables, all breakpoints) — E2E + build

- [ ] **T-34**: Author E2E / manual verification checklist proving spec closure.

  **Scope**: Tests + docs.
  **Files**: `frontend/e2e/responsive-tables.spec.ts` (new, Playwright — if harness exists) or `frontend/src/app/features/incidents/incident-list/incident-list.e2e.spec.ts` placeholder; checklist lives in `openspec/changes/front/2026-09-15-responsive-design-tables/verify-report.md` (written in verify phase, referenced here)
  **Done criteria**:
  - E2E asserts: iPhone SE (375px) shows card grid 1-col, iPad (768px) 2-col, desktop (1280px) shows `<table>` (S1.1, S2.1, S7.1); sticky header on desktop scroll (S1.2); each table S9.1–S9.5 card fields correct; filter drawer hidden on mobile / visible on desktop (S4.1–S4.5); infinite scroll button manual-only (S3.1–S3.5); no console a11y warnings; `pnpm test` all green; `pnpm run build` exit 0; Lighthouse mobile ≥80 noted.
  - Covers R1–R10 closure and S10.1–S10.2 progressive enhancement (JS-disabled fallback: table renders with `overflow-x-auto`).

---

## Traceability — every spec scenario mapped to a task

| Spec | Scenarios → Tasks |
|------|-------------------|
| R1 Desktop | S1.1 → T-07, T-08, T-14, T-21, T-22; S1.2 → T-21, T-22 |
| R2 Mobile cards | S2.1 → T-07, T-08, T-13, T-14, T-21, T-22; S2.2 → T-03–T-06, T-13, T-19, T-25; S2.3 → T-11, T-12; S2.4 → T-09, T-10; S2.5 → T-04, T-30 |
| R3 Infinite scroll | S3.1 → T-15, T-16, T-19, T-20; S3.2–S3.5 → T-15, T-16, T-19, T-20 |
| R4 Filter drawer | S4.1–S4.5 → T-17, T-18, T-19, T-20 |
| R5 Context | S5.1 → T-15, T-29, T-30; S5.2 → T-23, T-24; S5.3 → T-32, T-33 |
| R6 Dropdown | S6.1 → T-09, T-10; S6.2 → T-09, T-10, T-27, T-28, T-31; S6.3 → T-13, T-14; S6.4 → T-09, T-10 |
| R7 Breakpoints | S7.1 → T-01, T-02, T-21, T-22; S7.2–S7.3 → T-22, T-30 |
| R8 A11y | S8.1–S8.4 → T-03, T-04, T-09, T-10, T-27, T-28, T-31 |
| R9 All 5 tables | S9.1 → T-05, T-13, T-14; S9.2–S9.3 → T-19, T-20; S9.4–S9.5 → T-25, T-26 |
| R10 Progressive | S10.1–S10.2 → T-21, T-22, T-34 |
| D1–D14 | D1 T-07–T-08; D2 T-01–T-02; D3 T-05–T-06; D4 T-09–T-10; D5 T-15–T-16; D6 T-17–T-18; D7 T-21–T-22; D8 T-11–T-12; D9 T-23–T-24; D10 T-27–T-28; D11 T-29–T-30; D12 T-03–T-04; D13 T-21–T-22; D14 T-32–T-33 |

**Nothing dropped** — every S scenario and every D phase appears above.

---

## Review Workload Forecast (detailed — per batch)

| Batch | Est. authored lines (add + del) | Files touched | Tests included | Standalone? |
|-------|----------------------------------|---------------|----------------|-------------|
| **1 — Foundation** | **320–380** | 5 new + 1 modified (`layout.service`) | 4 spec files (T-01, T-03, T-05, T-07) | Yes — no list pages depend on it yet |
| **2 — Actions** | **300–380** | 2 new (`action-dropdown`) + 2 modified (`data-card`, `table-to-card`) + 2 modified (`incident-list.*`) | 3 spec files (T-09, T-11, T-13) | Yes — incidents pilot ships alone |
| **3 — Data loading & filtering** | **360–420** ⚠️ | 1 new (`filter-drawer`) + 1 modified (`table-to-card`) + 4 modified (`incident-list`, `users-list.*`, `roles.*`) | 3 spec files (T-15, T-17, T-19) | Yes — users+roles integration is its own PR |
| **4 — Layout & persistence** | **380–440** ⚠️ | 2 style files + 1 modified (`ui-table`) + 4 modified (`org-list.*`, `category-list.*`, `incidents/users/roles` persistence) | 3 spec files (T-21, T-23, T-25) | Yes — orgs+categories complete R9 |
| **5 — Polish** | **220–280** | 3 modified (card/dropdown/drawer) + 2 style files | 3 spec files (T-27, T-29, T-31) + optional Playwright | Yes — pure polish, no new components |
| **6 — Navigation** | **80–120** | 1 modified (`app.config`) + 1–2 modified (list scroll hooks) + 1 new (e2e) | 2 spec files (T-32, T-34) | Yes — smallest slice |
| **Total** | **~1,660–2,020** | ~14 new + ~16 modified | ~18 spec files + 1 e2e | 6 PRs |

| Field | Value |
|-------|-------|
| Estimated changed lines | **~1,650–1,950 authored** (total across 6 PRs; per-PR estimates above) |
| 400-line budget risk | **High** — Batches 3 and 4 are at/just over the line; Batch 1 and 2 close to it |
| Chained PRs recommended | **Yes** |
| Suggested split | **6 PRs (one per batch)** on `feature-branch-chain` |
| Delivery strategy | `ask-on-risk` |
| Chain strategy | `feature-branch-chain` (tracker `feat/responsive-tables` → PR 1 → PR 2 → … → PR 6) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

**Why `feature-branch-chain` (not stacked-to-main):**
- All 5 table integrations must land together before main — merging a partial set to `main` would leave half the tables responsive and half not, an inconsistent shipped state.
- Tracker branch `feat/responsive-tables` accumulates the full feature; each PR targets its parent (`PR 2 → PR 1 branch`, etc.) so diffs stay focused and reviewers see only the current batch.
- Rollback is scoped: reverting the tracker reverts the whole feature atomically.

**Alternative considered — `stacked-to-main`:**
Rejected because batches 2–4 each integrate a subset of tables; shipping increments to `main` would expose users to a half-responsive UI. Stacking is better for independently shippable slices — this feature is only consistent when all batches land.

**If Batch 3 or 4 exceeds 400 after the honest slicing pass:**
Do **not** shrink code, delete tests, or compress styles. Keep the best cohesive split (D5+D6 together, D7+D9+D13 together — splitting those would reintroduce style/state conflicts), report the overage (est. +20–40 lines), and request `size:exception` on that PR with the rationale "shared style + multi-table wiring cannot be split without cross-PR conflicts". Chaining stays bounded at one pass per the `chained-pr` skill.

---

## Commit discipline (work-unit-commits)

Each `T-*` maps to one commit or a small commit group that keeps **tests with code** and **docs with the user-visible change**. Message style: Conventional Commits, e.g. `feat(responsive-tables): add DataCard with 3-field contract and tests` (T-04), `feat(responsive-tables): wire ActionDropdown into DataCard footer` (T-12). Every commit records its focused test command + result and rollback boundary (see Suggested Work Units above) before opening its PR.

---

## Gates before apply (orchestrator checklist)

- [ ] User confirms `feature-branch-chain` on tracker `feat/responsive-tables` (ask-on-risk gate).
- [ ] Apply batches strictly 1→6; each batch must show `pnpm test` (relevant spec slice) green + `pnpm run build` exit 0 before requesting review.
- [ ] No skipping the spec approval gate that precedes apply (SDD contract — proposal/spec/design already approved for this change).
- [ ] Working tree left clean (no staged residual) — human commits per AGENTS.md.
