# Specification: F6 — Auditoría de Acceso Menu Rendering (Frontend)

**Change**: `2026-09-11-f6-audit-logs-menu` (frontend)
**Scope**: Sidebar menu display
**Date**: 2026-09-11

---

## Overview

Cuando backend envía menu entry para "Auditoría de Acceso", el sidebar frontend debe:
1. Recibir en MenuService via GET /api/menus/my
2. Transformar BackendMenuItem → MenuItem (con `group` y `icon`)
3. Agrupar por `group` field
4. Renderizar en HTML bajo sección "GESTIÓN"
5. Mostrar ícono "file-text" Lucide
6. Link clickeable a `/app/admin/audit-logs`

---

## Requirements

### R1: MenuService Reception

**Acceptance**:
- MenuService.getMenuFromBackend() recibe respuesta con entry:
  ```json
  {
    "label": "Auditoría de Acceso",
    "route": "/admin/audit-logs",
    "icon": "file-text",
    "group": "GESTIÓN",
    "order": 85
  }
  ```
- HTTP status 200, no errors
- Entry llega entre otros items (usuarios, roles, org, etc)

### R2: MenuItem Transformation

**Acceptance**:
- MenuService.transformBackendMenu() mapea BackendMenuItem a MenuItem:
  - `label` → `name`
  - `route` → `route`
  - `icon` → `icon`
  - `group` → `group` (propiedad opcional, preservada)
  - `order` → `menu_order`
- Resultado MenuItem tiene:
  ```typescript
  {
    id: (index+1),
    name: "Auditoría de Acceso",
    route: "/admin/audit-logs",
    icon: "file-text",
    menu_order: 85,
    is_active: true,
    group: "GESTIÓN",
    children: []
  }
  ```

### R3: Route Formatting

**Acceptance**:
- MenuService.formatRoutes() asegura `/app` prefix:
  - Input route: `/admin/audit-logs`
  - Output route: `/app/admin/audit-logs`
  - Guarda `!startsWith('/app')` evita duplicación

### R4: Grouping Computation

**Acceptance**:
- Sidebar.groupedMenuItems computed agrupa por `group` field
- Preserva orden del backend (D3)
- Resultado contiene MenuGroup:
  ```typescript
  {
    label: "GESTIÓN",
    items: [
      { name: "Usuarios", order: 60, ... },
      { name: "Roles", order: 70, ... },
      { name: "Organizaciones", order: 80, ... },
      { name: "Auditoría de Acceso", order: 85, icon: "file-text", ... }
    ]
  }
  ```
- Items dentro del grupo mantienen orden ascendente (60 < 70 < 80 < 85)

### R5: Sidebar HTML Rendering

**Acceptance**:
- sidebar.component.html renderiza grupo "GESTIÓN" con:
  - `<div class="sidebar-section-label">GESTIÓN</div>` encabezado
  - `<ul>` lista de 4 items
  - Cada item es `<li>` con `<a>` (no tienen children)
- Para "Auditoría de Acceso":
  - `<a [routerLink]="[item.route]">` → `/app/admin/audit-logs`
  - `<ui-icon [name]="item.icon">` → `file-text`
  - Visible text: "Auditoría de Acceso"
  - routerLinkActive="active" se aplica cuando ruta activa

### R6: Icon Rendering

**Acceptance**:
- ui-icon component recibe `name="file-text"`
- Icon renders correctly (Lucide "file-text" es documento/archivo)
- Icon appears before text (margin-right: 0.5rem)
- Icon size: 16px default (matches otros items)
- No fallback/placeholder si icon name válido

### R7: Link Navigation

**Acceptance**:
- Click en "Auditoría de Acceso" →routerLink("/app/admin/audit-logs")
- Browser navigates to `/app/admin/audit-logs`
- Route guard (PermissionGuard) validated by backend (already filtered entry)
- No 404 (route exists in app.routes.ts)

### R8: Permission Filtering (Backend Responsibility)

**Acceptance**:
- Si usuario NO tiene "READ audit-logs" permission:
  - Backend NO incluye entry en `GET /api/menus/my` response
  - Frontend receives array sin "Auditoría de Acceso"
  - Sidebar renders sin entry (nothing to render)
  - No error, no 403; simplemente ausente
- Si usuario SÍ tiene permission:
  - Backend includes entry
  - Frontend renders

### R9: Search Functionality

**Acceptance**:
- Sidebar search (Ctrl+K / click search icon) filtra menu items
- Query "auditor" o "cambios" or "acceso":
  - Matches "Auditoría de Acceso" name
  - Entry appears in search results
  - Parent group "GESTIÓN" label shown above
  - Can navigate via filtered result

### R10: Responsive Behavior

**Acceptance**:
- Sidebar collapsed (hamburger menu closed) → icon only visible, tooltip "Auditoría de Acceso" appears on hover
- Sidebar expanded → text + icon visible
- Mobile: sidebar collapses by default; icon behavior same
- Tablet/Desktop: full text visible

---

## Scenarios

### Scenario 1: Master User Sees Entry in Sidebar

```
Given master user (has READ audit-logs permission)
When page loads and MenuService.getMenuFromBackend() fetches menu
Then sidebar.component.ts receives MenuItem with name="Auditoría de Acceso"
And groupedMenuItems includes "GESTIÓN" group
And "GESTIÓN" group.items has 4 items: Usuarios, Roles, Organizaciones, Auditoría
And sidebar.component.html renders "GESTIÓN" section with 4 links in order
And entry "Auditoría de Acceso" has icon="file-text"
```

### Scenario 2: Non-Master User Does NOT See Entry

```
Given operator user (no READ audit-logs permission)
When MenuService.getMenuFromBackend() fetches GET /api/menus/my
Then backend response does NOT include "Auditoría de Acceso" entry
And frontend menuItems signal receives 3 items (Usuarios, Roles, Org) only
And groupedMenuItems computed includes "GESTIÓN" group with 3 items
And "Auditoría de Acceso" NOT visible anywhere in sidebar
```

### Scenario 3: Entry Appears Under GESTIÓN Group

```
Given backend sends entry with group="GESTIÓN"
When sidebar.groupedMenuItems computed groups by field
Then creates MenuGroup { label: "GESTIÓN", items: [...] }
And "Auditoría de Acceso" is in group.items (not in separate group)
And renders under "GESTIÓN" section label
And above other items: Usuarios (60), Roles (70), Org (80), Auditoría (85)
```

### Scenario 4: Order Preserved Correctly

```
Given backend sends items with orders: 60, 70, 85, 80
When sidebar receives and renders
Then display order: 60, 70, 80, 85 (sorted by menu_order)
And "Auditoría" (85) appears AFTER "Organizaciones" (80)
And "Roles" (70) appears AFTER "Usuarios" (60)
```

### Scenario 5: Icon Renders Correctly

```
Given entry has icon="file-text"
When sidebar renders item
Then ui-icon component receives name="file-text"
And icon displays as document/file symbol from Lucide
And icon is 16px, positioned left of text
And no error/warning in console
```

### Scenario 6: Link Navigates to Correct Route

```
Given user clicks on "Auditoría de Acceso" entry
When [routerLink]="/app/admin/audit-logs" is followed
Then router navigates to /app/admin/audit-logs
And URL changes to /app/admin/audit-logs
And PermissionGuard validates user has READ audit-logs (allows)
And /app/admin/audit-logs component loads (no 404)
```

### Scenario 7: Search Filters to Entry

```
Given sidebar search is active
And user types "audit" or "acceso" or "cambios"
When sidebar.filteredMenuItems computed filters
Then "Auditoría de Acceso" matches query
And entry appears in filtered results
And "GESTIÓN" group label shown above entry
And click navigates to /app/admin/audit-logs
```

### Scenario 8: Collapsed Sidebar Tooltip

```
Given sidebar is collapsed (sidebarOpen() = false)
When user hovers over "Auditoría de Acceso" icon
Then matTooltip shows "Auditoría de Acceso" text
And tooltip appears on right side
And no text label visible (space constraint)
And click still works
```

### Scenario 9: GESTIÓN Group NOT Omitted When Has Fewer Items

```
Given hypothetical user with READ audit-logs but NOT READ users/roles
When sidebar renders
Then GESTIÓN group appears (even though only 1 item: Auditoría)
And group label "GESTIÓN" is shown
And item renders correctly
And no conditional logic omits empty groups (F1 D3: groups are always shown if have items)
```

### Scenario 10: Sequential Menu Updates

```
Given page is open with menu loaded
When backend adds new entry (or user permission changes)
And MenuService is called again (e.g., after user edit)
Then menuItemsSignal is updated
And groupedMenuItems recomputes
And sidebar re-renders with new state
And "Auditoría de Acceso" appears/disappears accordingly
```

---

## Out of Scope

- Permission guard logic (backend responsibility)
- CSS styling for new entry (existing styles apply)
- Backend menu API changes (GET /api/menus/my already exists)
- Entry edit/delete functionality (read-only menu)
