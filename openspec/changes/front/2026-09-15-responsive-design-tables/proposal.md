# Proposal: Responsive Tables → Mobile Card View

**Change**: `2026-09-15-responsive-design-tables`  
**Scope**: Frontend (Angular) — UI/UX responsive redesign  
**Date**: 2026-09-15  
**Phase**: Post-F6 (F6.1)

---

## Intent

Make all data tables responsive across mobile, tablet, and desktop viewports. On mobile (sm/md: <1024px), convert table layout to mobile-friendly card grid with:
- **3-field card view**: Primary field + 2 metadata fields
- **Inline actions**: "Ver detalle" button + dropdown menu (⋮ three-dots) for edit/delete/more
- **Infinite scroll**: Load-on-demand with "Ver más datos" button (no pagination)
- **Collapsible filters**: Drawer-based filter panel on mobile
- **Sticky header**: Maintain context on scroll
- **Tailwind breakpoints**: Standard (sm=640, md=768, lg=1024, xl=1280, 2xl=1536)

**Result**: Single responsive codebase. Tables auto-convert to cards <1024px. No separate mobile app needed.

---

## Scope

### In Scope (All Tables)

**Tables affected** (5):
1. **Incidents** (`IncidentsListComponent`)
   - Card fields: `{title, status, priority}`
   - Actions: detail, edit, claim, release, close, delete

2. **Users** (`UsersListComponent`)
   - Card fields: `{nombre, email, rol}`
   - Actions: detail, edit, delete, permissions

3. **Roles** (`RolesComponent`)
   - Card fields: `{nombre, permisos count, usuarios count}`
   - Actions: detail, edit, delete

4. **Organizations** (`OrganizationListComponent`)
   - Card fields: `{nombre, zona, usuarios count}`
   - Actions: detail, edit, delete, assign-category

5. **Incident Categories** (`CategoryListComponent`)
   - Card fields: `{nombre, descripcion, icon}`
   - Actions: detail, edit, delete

**Components & Features**:
- New `TableToCardComponent` (reusable wrapper)
- Filter drawer (collapsible, mobile-only)
- Infinite scroll trigger + "Ver más datos" button
- Dropdown action menu (3-dot kebab)
- Mobile-optimized spacing (Tailwind sm/md)

### Out of Scope

- Backend changes (API stays same, pagination optional)
- Real-time updates (no WebSocket changes)
- Animations beyond existing (focus on layout)
- PWA install prompts (future)
- Separate mobile UI library (use Tailwind classes only)

---

## Affected Components

| Component | Type | Change |
|-----------|------|--------|
| `frontend/src/app/shared/components/ui-table/ui-table.component.ts` | Modified | Add responsive wrapper logic + mobile detection |
| `frontend/src/app/shared/components/table-to-card/table-to-card.component.ts` | New | Reusable table→card layout conversion |
| `frontend/src/app/shared/components/action-dropdown/action-dropdown.component.ts` | New | Kebab menu (⋮) for edit/delete/more |
| `frontend/src/app/shared/components/filter-drawer/filter-drawer.component.ts` | New | Collapsible filter panel |
| `frontend/src/app/features/incidents/incidents-list/incidents-list.component.ts` | Modified | Use table-to-card + infinite scroll |
| `frontend/src/app/features/admin/users/users-list/users-list.component.ts` | Modified | Use table-to-card + infinite scroll |
| `frontend/src/app/features/admin/roles/roles.component.ts` | Modified | Use table-to-card + infinite scroll |
| `frontend/src/app/features/catalogs/organizations/org-list/org-list.component.ts` | Modified | Use table-to-card + infinite scroll |
| `frontend/src/app/features/catalogs/incident-categories/category-list/category-list.component.ts` | Modified | Use table-to-card + infinite scroll |
| `frontend/src/styles/_tables.css` | Modified | Add responsive card styles |
| `frontend/src/styles/_layout.css` | Modified | Update breakpoints (sm/md/lg/xl/2xl) |

---

## Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Reusable `TableToCardComponent`** | DRY principle; 5 tables share same layout logic (3 fields + actions) |
| D2 | **3-field card limitation** | Prevents mobile clutter; "Ver detalle" modal shows full record |
| D3 | **Dropdown (⋮) for actions** | Maintains visual hierarchy; context menu keeps card compact |
| D4 | **Infinite scroll + "Ver más datos"** | UX: avoid surprise loads; user controls pagination on mobile |
| D5 | **Filter drawer (collapsible)** | Saves screen real estate; expand only when filtering needed |
| D6 | **Tailwind breakpoints (standard)** | Consistency with design system (F0); easier to maintain |
| D7 | **No separate mobile routes** | Single codebase; CSS media queries handle layout |
| D8 | **Sticky header on desktop; hidden on mobile** | Desktop: context; mobile: space savings |
| D9 | **Card grid: 1 col (mobile), 2 col (tablet), auto (desktop)** | Progressive disclosure as viewport grows |
| D10 | **Preserve sort/filter state on route change** | Users don't lose context navigating away and back |

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| Component bloat if TableToCard tries to handle all edge cases | Med | Strict scope: 3 fields + actions only. Complex customizations via prop config |
| Mobile action menu truncates on very small screens (<360px) | Low | Test on iPhone SE (375px). Use hamburger-style menu as fallback |
| Infinite scroll performance hit with large datasets (1000+ rows) | Low | Lazy-load images, virtual scroll (CDK) if >500 rows |
| Filter drawer positioning issues on landscape mobile | Low | Test landscape (Android). Use fixed positioning with overflow |
| Existing table tests break with new responsive wrapper | Med | Update ui-table.spec.ts; add new table-to-card.spec.ts with full coverage |

---

## Rollback Plan

1. Remove TableToCardComponent, ActionDropdown, FilterDrawer from shared
2. Revert imports in all 5 list components to use original `ui-table` directly
3. Delete responsive CSS from _tables.css
4. Restore breakpoints in _layout.css to pre-responsive state (only 2 media queries)
5. No DB changes; data unaffected

---

## Dependencies

- **Tailwind CSS** (existing, v4.3.3)
- **Angular** (existing, 21.2.22)
- **RxJS** (existing) — for scroll detection + infinite scroll
- **CDK Virtual Scroll** (optional, for large datasets)
- **LayoutService** (existing) — reuse for mobile detection

**No new external dependencies**

---

## Success Criteria

- [ ] `ui-table` renders as cards on sm/md screens (<1024px)
- [ ] All 5 tables (incidents, users, roles, orgs, categories) responsive
- [ ] Card grid: 1 col mobile, 2 col tablet, 3-4 col desktop
- [ ] "Ver detalle" button always visible; works on mobile
- [ ] Dropdown (⋮) menu works on touch (no hover required)
- [ ] Filter drawer: hidden by default on mobile, visible on desktop
- [ ] Infinite scroll: "Ver más datos" button appears at bottom
- [ ] No layout shift on scroll (sticky elements stable)
- [ ] Lighthouse mobile score ≥ 80 (performance, accessibility)
- [ ] All existing tests pass; new responsive tests added
- [ ] Manual testing: iPhone SE, iPad, MacBook (landscape/portrait)
- [ ] No console warnings (a11y, layout thrashing)

---

## Timeline & Phases

**Total estimate**: 16 hours (post-F6 phase)

- **Phase A** (3h): `TableToCardComponent` + `ActionDropdown` + `FilterDrawer` (reusable)
- **Phase B** (2h): Incidents list → responsive
- **Phase C** (2h): Users + Roles lists → responsive
- **Phase D** (2h): Organizations + Categories lists → responsive
- **Phase E** (3h): Responsive CSS refinement + mobile testing
- **Phase F** (2h): Tests + accessibility audit + Lighthouse optimization

---

## Open Questions (Resolved)

| Q | A | By |
|---|---|---|
| Card fields (how many?) | 3 fields + "Ver detalle" button | User |
| Action buttons (inline or menu?) | Dropdown (⋮) menu + detail button | User |
| Pagination (page numbers or infinite?) | Infinite scroll + "Ver más datos" button | User |
| Filters (visible or collapsible?) | Collapsible drawer on mobile | User |
| Breakpoints (standard or custom?) | Tailwind standard (sm/md/lg/xl/2xl) | User |
| Component strategy (reusable or custom?)| Reusable TableToCard + configurable | User |
| Scope (all tables or subset?) | All 5 existing tables | User |
| Priority (urgent or post-F6?) | Post-F6 (F6.1) | User |

---

## Implementation Order

1. Create shared reusable components (TableToCard, ActionDropdown, FilterDrawer)
2. Update ui-table to use TableToCard as wrapper
3. Migrate each list component sequentially (1 per phase)
4. Test on real mobile devices (not browser DevTools alone)
5. Optimize performance (lazy load, virtual scroll if needed)
6. Audit accessibility (WCAG 2.1 AA on mobile)
7. Final Lighthouse audit before merge
