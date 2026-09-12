# Tasks: F6 — Auditoría de Acceso Menu Rendering (Frontend)

**Change**: `2026-09-11-f6-audit-logs-menu` (frontend)
**Scope**: Menu rendering validation (NO CODE CHANGES)
**Date**: 2026-09-11

---

## Execution Plan

Frontend is already prepared (no code changes). Tasks are validation-only via testing.

Divided into 3 phases: ~4 hours total (unit tests + integration tests + manual E2E).

---

## Phase 1: Unit Tests (1h)

### T1.1: Validate MenuService.transformBackendMenu() preserves `group` and `icon`

**File**: `frontend/src/app/core/services/menu.service.spec.ts`

Existing test file should verify:

```typescript
describe('MenuService.transformBackendMenu()', () => {
  it('preserves group field when present', () => {
    const backendMenu: BackendMenuItem[] = [
      {
        label: 'Auditoría de Acceso',
        route: '/admin/audit-logs',
        icon: 'file-text',
        group: 'GESTIÓN',
        order: 85,
      },
    ];

    const result = service['transformBackendMenu'](backendMenu);
    
    expect(result[0].name).toBe('Auditoría de Acceso');
    expect(result[0].group).toBe('GESTIÓN');
    expect(result[0].icon).toBe('file-text');
    expect(result[0].route).toBe('/admin/audit-logs');
    expect(result[0].menu_order).toBe(85);
  });

  it('handles missing group field gracefully', () => {
    const backendMenu: BackendMenuItem[] = [
      {
        label: 'Some Item',
        route: '/some-route',
      },
    ];

    const result = service['transformBackendMenu'](backendMenu);
    
    expect(result[0].group).toBeUndefined();
  });

  it('maps all GESTIÓN items correctly', () => {
    const backendMenu: BackendMenuItem[] = [
      { label: 'Usuarios', route: '/admin/users', group: 'GESTIÓN', order: 60 },
      { label: 'Roles', route: '/admin/roles', group: 'GESTIÓN', order: 70 },
      { label: 'Organizaciones', route: '/admin/organizaciones', group: 'GESTIÓN', order: 80 },
      { label: 'Auditoría de Acceso', route: '/admin/audit-logs', icon: 'file-text', group: 'GESTIÓN', order: 85 },
    ];

    const result = service['transformBackendMenu'](backendMenu);

    expect(result.length).toBe(4);
    expect(result[3].name).toBe('Auditoría de Acceso');
    expect(result[3].icon).toBe('file-text');
    expect(result[3].menu_order).toBe(85);
  });
});
```

**Acceptance**: All tests pass

---

### T1.2: Validate MenuService.formatRoutes() adds `/app` prefix

**File**: `frontend/src/app/core/services/menu.service.spec.ts`

```typescript
describe('MenuService.formatRoutes()', () => {
  it('adds /app prefix to route /admin/audit-logs', () => {
    const items: MenuItem[] = [
      {
        id: 1,
        name: 'Auditoría de Acceso',
        route: '/admin/audit-logs',
        icon: 'file-text',
        menu_order: 85,
        is_active: true,
        group: 'GESTIÓN',
        children: [],
      },
    ];

    const result = service['formatRoutes'](items);

    expect(result[0].route).toBe('/app/admin/audit-logs');
  });

  it('does not duplicate /app prefix if already present', () => {
    const items: MenuItem[] = [
      {
        id: 1,
        name: 'Test',
        route: '/app/admin/audit-logs',
        menu_order: 1,
        is_active: true,
        children: [],
      },
    ];

    const result = service['formatRoutes'](items);

    expect(result[0].route).toBe('/app/admin/audit-logs'); // not /app/app/...
  });
});
```

**Acceptance**: Tests pass

---

### T1.3: Validate Sidebar.groupedMenuItems groups by `group` field

**File**: `frontend/src/app/layout/sidebar/sidebar.component.spec.ts`

```typescript
describe('Sidebar.groupedMenuItems', () => {
  it('groups items by group field', () => {
    const menuItems: MenuItem[] = [
      { id: 1, name: 'Usuarios', route: '/app/admin/users', menu_order: 60, is_active: true, group: 'GESTIÓN' },
      { id: 2, name: 'Roles', route: '/app/admin/roles', menu_order: 70, is_active: true, group: 'GESTIÓN' },
      { id: 3, name: 'Organizaciones', route: '/app/admin/organizaciones', menu_order: 80, is_active: true, group: 'GESTIÓN' },
      { id: 4, name: 'Auditoría de Acceso', route: '/app/admin/audit-logs', icon: 'file-text', menu_order: 85, is_active: true, group: 'GESTIÓN' },
    ];

    // Mock menuService.menuItems
    TestBed.inject(MenuService).menuItems = () => menuItems;

    const component = TestBed.createComponent(Sidebar).componentInstance;
    const groups = component.groupedMenuItems();

    expect(groups.length).toBe(1); // One group: GESTIÓN
    expect(groups[0].label).toBe('GESTIÓN');
    expect(groups[0].items.length).toBe(4); // All 4 items in GESTIÓN
    expect(groups[0].items[3].name).toBe('Auditoría de Acceso');
  });

  it('preserves order within group (60, 70, 80, 85)', () => {
    // [same setup as above]
    const groups = component.groupedMenuItems();
    const gestión = groups[0].items;

    expect(gestión[0].menu_order).toBe(60); // Usuarios
    expect(gestión[1].menu_order).toBe(70); // Roles
    expect(gestión[2].menu_order).toBe(80); // Organizaciones
    expect(gestión[3].menu_order).toBe(85); // Auditoría
  });
});
```

**Acceptance**: Tests pass, order preserved

---

### T1.4: npm test for all changes

- [ ] `npm run lint` → clean
- [ ] `npm run typecheck` → clean
- [ ] `npm test` → all menu.service.spec.ts + sidebar.component.spec.ts pass

**Acceptance**: All tests green

---

## Phase 2: Integration Tests (1.5h)

### T2.1: E2E Test — Master User Sees Auditoría Entry

**File**: `frontend/e2e/menu-sidebar.e2e.spec.ts` (or similar)

Test:
```typescript
describe('Sidebar Menu — Auditoría de Acceso', () => {
  it('master user sees Auditoría entry under GESTIÓN group', async () => {
    // Login as master user (has READ audit-logs permission)
    await login('master@example.com', 'password');

    // Navigate to home/app (sidebar loads)
    await page.goto('/app');

    // Verify GESTIÓN group exists
    const gestióSection = await page.locator('text=GESTIÓN');
    await expect(gestióSection).toBeVisible();

    // Verify 4 items in GESTIÓN
    const gestióItems = await page.locator('a.nav-link-custom').filter({ has: page.locator('..').filter({ has: gestióSection }) });
    const itemCount = await gestióItems.count();
    expect(itemCount).toBe(4); // Usuarios, Roles, Org, Auditoría

    // Verify "Auditoría de Acceso" is present
    const auditEntry = await page.locator('text=Auditoría de Acceso');
    await expect(auditEntry).toBeVisible();

    // Verify file-text icon is present
    const fileIcon = await page.locator('svg[data-name="file-text"]');
    await expect(fileIcon).toBeVisible();
  });

  it('clicking Auditoría entry navigates to /app/admin/audit-logs', async () => {
    await login('master@example.com', 'password');
    await page.goto('/app');

    // Click "Auditoría de Acceso"
    await page.locator('text=Auditoría de Acceso').click();

    // Verify URL changed
    await expect(page).toHaveURL(/\/app\/admin\/audit-logs/);

    // Verify page loaded (audit-logs component renders)
    // (assuming audit-logs page has unique content)
    const pageHeader = await page.locator('text=Auditoría de Cambios'); // expected h1 or similar
    await expect(pageHeader).toBeVisible();
  });

  it('operator user does NOT see Auditoría entry', async () => {
    // Login as operator (no READ audit-logs)
    await login('operator@example.com', 'password');

    await page.goto('/app');

    // Verify GESTIÓN group still exists (if other items present)
    const gestióSection = await page.locator('text=GESTIÓN');
    // Could be visible or not, depending on whether operator has other GESTIÓN perms

    // Verify "Auditoría de Acceso" is NOT visible
    const auditEntry = await page.locator('text=Auditoría de Acceso');
    await expect(auditEntry).not.toBeVisible();
  });
});
```

**Acceptance**: E2E tests pass

---

### T2.2: Search Filter Test

Test:
```typescript
it('search sidebar for "audit" shows Auditoría entry', async () => {
  await login('master@example.com', 'password');
  await page.goto('/app');

  // Open sidebar search (Ctrl+K or click search)
  await page.press('body', 'Control+K');
  // or: await page.locator('button[aria-label="Buscar en el menú"]').click();

  // Type "audit"
  const searchInput = await page.locator('input[placeholder="Buscar..."]');
  await searchInput.fill('audit');

  // Verify "Auditoría de Acceso" appears in filtered results
  const auditEntry = await page.locator('text=Auditoría de Acceso');
  await expect(auditEntry).toBeVisible();

  // Verify it's still under "GESTIÓN" label
  const gestióLabel = await page.locator('text=GESTIÓN');
  await expect(gestióLabel).toBeVisible();
});
```

**Acceptance**: Search test passes

---

### T2.3: Icon Validation

Test:
```typescript
it('file-text icon renders without errors', async () => {
  await login('master@example.com', 'password');
  await page.goto('/app');

  // Verify no console errors
  const consoleLogs = [];
  page.on('console', (msg) => consoleLogs.push(msg.text()));

  // Look for "Auditoría de Acceso" icon
  const fileIcon = await page.locator('svg[data-name="file-text"]').first();
  await expect(fileIcon).toBeVisible();

  // Verify icon is rendered (not placeholder)
  const svgPath = await fileIcon.locator('path').count();
  expect(svgPath).toBeGreaterThan(0); // Valid SVG has paths

  // Verify no error logs
  const errorLogs = consoleLogs.filter((log) => log.includes('error'));
  expect(errorLogs.length).toBe(0);
});
```

**Acceptance**: Icon renders correctly, no console errors

---

### T2.4: Responsive Test (Collapsed Sidebar)

Test:
```typescript
it('collapsed sidebar shows icon tooltip on hover', async () => {
  await login('master@example.com', 'password');
  await page.goto('/app');

  // Simulate collapsed sidebar (or close sidebar)
  // This depends on layout logic; pseudocode:
  await page.locator('button[aria-label="Toggle sidebar"]').click();

  // Sidebar should be collapsed
  await expect(page.locator('.sidebar-open')).not.toBeVisible();

  // Hover over "Auditoría de Acceso" icon
  const fileIcon = await page.locator('svg[data-name="file-text"]').first();
  await fileIcon.hover();

  // Verify tooltip appears
  const tooltip = await page.locator('text=Auditoría de Acceso');
  await expect(tooltip).toBeVisible();

  // Click should still work
  await fileIcon.click();
  await expect(page).toHaveURL(/\/app\/admin\/audit-logs/);
});
```

**Acceptance**: Responsive behavior works

---

## Phase 3: Manual E2E Testing (1.5h)

### T3.1: Manual Test — Master User Full Flow

Checklist:
- [ ] Clear browser cache
- [ ] Login as master user
- [ ] Navigate to /app/dashboard or home page
- [ ] Sidebar loads
- [ ] "GESTIÓN" section visible
- [ ] 4 items visible under GESTIÓN: Usuarios, Roles, Organizaciones, Auditoría de Acceso
- [ ] Auditoría entry has file-text icon (document/file symbol)
- [ ] Click "Auditoría de Acceso" → page navigates to /app/admin/audit-logs
- [ ] /app/admin/audit-logs page loads correctly (no 404)
- [ ] Browser console has no errors

**Acceptance**: All checks pass

---

### T3.2: Manual Test — Operator User (No Permission)

Checklist:
- [ ] Logout
- [ ] Login as operator user (no READ audit-logs permission)
- [ ] Navigate to /app
- [ ] Sidebar loads
- [ ] "Auditoría de Acceso" is NOT visible in sidebar
- [ ] "GESTIÓN" section still visible with other items (if operator has other GESTIÓN perms)
- [ ] Search sidebar for "audit" → no results (or entry doesn't appear)
- [ ] Try to manually navigate to /app/admin/audit-logs → access denied (403 or redirect)

**Acceptance**: All checks pass

---

### T3.3: Manual Test — Search Functionality

Checklist:
- [ ] Login as master
- [ ] Open sidebar search (Ctrl+K or click search icon)
- [ ] Type "audit" → "Auditoría de Acceso" appears in filtered results
- [ ] Type "cambios" → entry appears (synonym search)
- [ ] Type "acceso" → entry appears
- [ ] Type "xyz" → entry does NOT appear
- [ ] Click entry in search results → navigate to /app/admin/audit-logs
- [ ] Clear search → full sidebar restores

**Acceptance**: All checks pass

---

### T3.4: Manual Test — Order Verification

Checklist:
- [ ] Login as master
- [ ] Navigate to /app
- [ ] Verify GESTIÓN section items appear in this order (top to bottom):
  1. Usuarios (60)
  2. Roles (70)
  3. Organizaciones (80)
  4. Auditoría de Acceso (85)
- [ ] No reordering or jumbling

**Acceptance**: Order is correct

---

### T3.5: Manual Test — Responsive (Mobile/Tablet)

Checklist (mobile):
- [ ] Dev tools: device emulation iPhone 13
- [ ] Login as master
- [ ] Navigate to /app
- [ ] Sidebar is collapsed by default (hamburger icon visible)
- [ ] Click hamburger → sidebar expands
- [ ] "Auditoría de Acceso" visible with full text
- [ ] Click entry → navigate to /app/admin/audit-logs
- [ ] Sidebar collapses (auto)

Checklist (tablet):
- [ ] Device emulation iPad
- [ ] Sidebar may be visible/collapsed depending on layout
- [ ] Entry still renders correctly
- [ ] Navigation works

**Acceptance**: Responsive behavior works

---

### T3.6: Manual Test — Backend Integration

Checklist:
- [ ] Backend SDD merged and deployed
- [ ] Migration 0053 executed (permission "READ audit-logs" exists in DB)
- [ ] Master user has been granted READ audit-logs permission
- [ ] Operator user has NOT been granted permission
- [ ] GET /api/menus/my response from backend includes entry:
  ```json
  {
    "label": "Auditoría de Acceso",
    "route": "/admin/audit-logs",
    "icon": "file-text",
    "group": "GESTIÓN",
    "order": 85
  }
  ```
  (only in master user's response, not operator's)

**Acceptance**: Backend API returns correct data

---

## Go/No-Go Criteria (Before Production)

- [ ] All unit tests pass (menu.service.spec.ts + sidebar.component.spec.ts)
- [ ] All E2E tests pass (master sees entry, operator doesn't, navigation works)
- [ ] npm lint + typecheck clean
- [ ] Manual testing: master user sees entry, operator doesn't
- [ ] Icon "file-text" renders correctly (no placeholder, no console errors)
- [ ] Order preserved (60, 70, 80, 85)
- [ ] Search filter works ("audit" → finds entry)
- [ ] Route /app/admin/audit-logs accessible and loads without 404
- [ ] No breaking changes to existing menu items

**Production Deploy**:
1. Backend SDD already deployed (MENU_MAP entry exists)
2. Frontend no code changes needed
3. Just verify via manual E2E in staging
4. Merge to main, deploy as normal

**Rollback**: No rollback needed — no code changed. If backend MENU_MAP entry removed, frontend naturally stops showing it.

---

## Summary

| Phase | Tasks | Time |
|-------|-------|------|
| 1. Unit Tests | T1.1-T1.4 | 1h |
| 2. Integration/E2E | T2.1-T2.4 | 1.5h |
| 3. Manual Testing | T3.1-T3.6 | 1.5h |
| **Total** | | **~4h** |

**Key Point**: Frontend requires NO CODE CHANGES. This SDD validates that existing code handles the new menu entry correctly.
