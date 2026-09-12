# Design: F6 — Auditoría de Acceso Menu Rendering (Frontend)

**Change**: `2026-09-11-f6-audit-logs-menu` (frontend)
**Scope**: Sidebar menu display
**Date**: 2026-09-11

---

## Architecture Decisions

### D1: No Frontend Code Changes Required

**Decision**: Frontend is ALREADY prepared to handle the new menu entry. No code modifications needed.

**Rationale**:
- MenuService already handles `group` field (added in F1, D3)
- MenuService already handles `icon` field (added in earlier phases)
- Sidebar.component.ts already groups items by `group` field dynamically
- sidebar.component.html already renders icons + groups generically
- When backend sends entry, it automatically appears in sidebar

**Evidence**:
- MenuService.transformBackendMenu() (line 75-91):
  ```typescript
  if (item.group) {
    out.group = item.group;
  }
  ```
  Already preserves `group` field if present in backend response.

- Sidebar.groupedMenuItems (line 76-92):
  ```typescript
  readonly groupedMenuItems = computed<MenuGroup[]>(() => {
    const items = this.filteredMenuItems();
    const groups: MenuGroup[] = [];
    const seen = new Map<string, MenuGroup>();
    for (const item of items) {
      const key = item.group ?? '';
      if (!seen.has(key)) {
        const group: MenuGroup = { label: key || null, items: [] };
        seen.set(key, group);
        groups.push(group);
      }
      seen.get(key)!.items.push(item);
    }
    return groups;
  });
  ```
  Dynamically groups by `item.group`. New entry will be grouped under "GESTIÓN" automatically.

- sidebar.component.html (line 69-70):
  ```html
  @if (item.icon) {
    <ui-icon [name]="item.icon" extraClass="mr-2 align-middle" />
  }
  ```
  Renders icon dynamically. "file-text" will display automatically.

**Consequence**: This is a **validation-only feature** for frontend. Testing occurs, but implementation is pre-existing.

---

### D2: MenuService Data Flow

**Decision**: MenuService.getMenuFromBackend() is the single source of truth for menu state.

**Rationale**:
- MenuService injects HttpClient, calls `GET /api/menus/my`
- Backend response is transformed once via transformBackendMenu()
- Transformed items are stored in menuItemsSignal
- menuItems computed exposes the signal reactively
- Sidebar consumes menuItems via dependency injection

**Flow**:
```
Backend MENU_MAP
    ↓
GET /api/menus/my endpoint (MenusService, backend)
    ↓
BackendMenuItem[] response: { label, route, icon, group, order }
    ↓
MenuService.transformBackendMenu() → MenuItem[]
    ↓
MenuService.formatRoutes() → add /app prefix
    ↓
menuItemsSignal.set(menu)
    ↓
Sidebar.menuItems (computed) → consumed
    ↓
Sidebar.groupedMenuItems (computed) → groups by `group`
    ↓
sidebar.component.html → renders groups + icons
```

---

### D3: Icon Validation (Frontend Test Responsibility)

**Decision**: Frontend tests validate that "file-text" is a valid Lucide icon name.

**Rationale**:
- Lucide icon pattern: `^[a-z][a-z0-9-]*$`
- "file-text" matches pattern (starts with lowercase, contains hyphens)
- Frontend test suite (menu.service.spec.ts) should verify:
  - MenuItem icon field contains only valid Lucide names
  - ui-icon component doesn't error on "file-text"
- Backend CRITICAL-2 test also validates this (D3, design.md backend)

**Not a concern**: ui-icon component gracefully handles unknown icon names (doesn't crash, but may show placeholder). Real Lucide icons like "file-text" will render correctly.

---

### D4: Search Filtering Includes New Entry

**Decision**: Sidebar search automatically includes "Auditoría de Acceso" when user types matching query.

**Rationale**:
- Sidebar.filteredMenuItems computed (line 44-69) filters all items by name
- Uses `this.normalize(item.name).includes(query)` for fuzzy matching
- "Auditoría" matches query "audit" or "auditoria" or "acceso"
- No special handling needed; generic filtering works

**Implementation**: Already exists, no changes.

---

### D5: Group Always Rendered When Items Present

**Decision**: "GESTIÓN" group always appears in sidebar if it contains at least one item, even if only "Auditoría de Acceso" is present (e.g., user lacks other GESTIÓN permissions).

**Rationale**:
- groupedMenuItems computed creates MenuGroup for every unique `group` field value
- No logic omits empty groups or single-item groups
- If backend filters response and returns only Auditoría entry, frontend receives one item with group="GESTIÓN"
- groupedMenuItems creates one group with label="GESTIÓN", items=[Auditoría]
- sidebar.component.html renders it

**Evidence**: No conditional `@if (group.items.length > 1)` in template. Groups render if present.

---

### D6: Order Computation at Backend

**Decision**: Item ordering (`menu_order`) is computed entirely by backend. Frontend preserves order as-is from MenuService.menuItems.

**Rationale**:
- Backend MENU_MAP defines `order` field for each entry
- MenusService (backend) returns items in sorted order
- Frontend MenuService.transformBackendMenu() preserves `order` → `menu_order`
- Sidebar renders items in the order received (preserves backend sort)
- groupedMenuItems groups items but preserves order within each group

**Note**: Frontend doesn't re-sort items. Backend is responsible for correct order.

---

### D7: No Frontend Caching of Menu

**Decision**: MenuService fetches fresh menu from backend on each app load. No client-side caching or localStorage.

**Rationale**:
- Menu is user-specific (permissions change between users)
- MenuService is providedIn: 'root' (singleton per app session)
- On login, getMenuFromBackend() is called; menu cached in menuItemsSignal for session
- On logout, clearMenu() wipes signal
- Minimal data size (typically <1KB), not worth caching complexity

**Assumption**: Backend GET /api/menus/my is called early (e.g., in App component ngOnInit or LayoutService init).

---

### D8: PermissionGuard Validates at Route Level

**Decision**: Permission validation happens at the route level (PermissionGuard), not in sidebar rendering.

**Rationale**:
- Sidebar just displays what backend sends
- If user lacks "READ audit-logs" permission, backend filters entry before sending
- Frontend sidebar has no logic to validate permissions (no double-checking)
- Route guard at /app/admin/audit-logs catches any unauthorized access
- Sidebar entry appears ↔ backend says user has permission

**Consequence**: Sidebar always renders accurate entry set (backend is authority).

---

## File Structure (No Changes)

```
frontend/src/
├── app/
│   ├── core/
│   │   ├── services/
│   │   │   └── menu.service.ts              (no changes; already handles group + icon)
│   │   └── models/
│   │       └── menu.model.ts                (no changes; MenuItem already has group field)
│   └── layout/
│       └── sidebar/
│           ├── sidebar.component.ts         (no changes; grouping already works)
│           └── sidebar.component.html       (no changes; icon rendering already works)
```

---

## Testing Strategy

### Unit Tests

**menu.service.spec.ts**:
- Test transformBackendMenu() preserves `group` field
- Test transformBackendMenu() preserves `icon` field
- Test formatRoutes() adds `/app` prefix correctly
- Test with sample entry: `{ label: "Auditoría de Acceso", group: "GESTIÓN", icon: "file-text", route: "/admin/audit-logs", order: 85 }`

**sidebar.component.spec.ts**:
- Test groupedMenuItems computed groups items by `group` field
- Test groupedMenuItems preserves order within each group
- Test groupedMenuItems when group="GESTIÓN" contains 4 items
- Test filteredMenuItems search matches "Auditoría" when user types "audit"

### Integration Tests

**Sidebar E2E**:
- Load app as master user (has READ audit-logs)
- Verify sidebar renders "GESTIÓN" section
- Verify "Auditoría de Acceso" appears under "GESTIÓN" with file-text icon
- Verify 4 items in order: Usuarios, Roles, Organizaciones, Auditoría (60, 70, 80, 85)
- Verify click navigates to /app/admin/audit-logs

**Sidebar E2E (No Permission)**:
- Load app as operator user (no READ audit-logs)
- Verify "Auditoría de Acceso" does NOT appear
- Verify "GESTIÓN" still renders with 3 items (if other GESTIÓN items present) or is absent (if no GESTIÓN items)

### Manual Testing

- [ ] Master user logs in → sidebar shows "Auditoría de Acceso" under "GESTIÓN" with file-text icon
- [ ] Click entry → navigates to `/app/admin/audit-logs`
- [ ] Search sidebar: type "audit" → "Auditoría de Acceso" appears in results
- [ ] Collapsed sidebar: icon visible, hover shows tooltip "Auditoría de Acceso"
- [ ] Operator user logs in → entry NOT visible in sidebar

---

## Constraints

- Sidebar is responsive (desktop/tablet/mobile) — icon still renders correctly on all sizes
- ui-icon component must support Lucide "file-text" icon (already does)
- Menu data arrives from backend via GET /api/menus/my (no frontend-side permission validation)

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| "file-text" icon not recognized | Low | Test validates icon name pattern; Lucide library supports it |
| Order not preserved | None | Backend sends sorted; frontend preserves order |
| Group doesn't render | None | groupedMenuItems computed already tested (F1) |
| User sees entry without permission | None | Backend filters; frontend displays what arrives |

---

## Rollback Plan

No rollback needed — no code changes. If MENU_MAP entry removed from backend:
1. Backend stops sending entry in GET /api/menus/my
2. Frontend menuItems receives array without "Auditoría de Acceso"
3. Sidebar renders without entry automatically
4. No code revert needed
