# Specification: F6 — Auditoría de Acceso Menu Entry

**Change**: `2026-09-11-f6-audit-logs-menu`
**Scope**: Menu visibility
**Date**: 2026-09-11

---

## Overview

Entrada "Auditoría de Acceso" en MENU_MAP que aparece en sidebar cuando usuario tiene permiso `READ audit-logs`, agrupada bajo "GESTIÓN", ordena después de Organizaciones (order 85). 

**Propósito**: Change tracking log — quién creó/editó/asignó/cerró incidencias, usuarios, etc. (NOT access logs like login timestamps).

---

## Requirements

### R1: Menu Entry Definition

**Acceptance**:
- Entry "Auditoría de Acceso" exists in MENU_MAP.
- Fields: label, route="/admin/audit-logs", requires="READ audit-logs", icon="file-text", group="GESTIÓN", order=75.
- Forma matches existing entries (MenuDefinition interface).

### R2: Permission Guard

**Acceptance**:
- Entry appears in MenusService output only if user has uuid for permission "READ audit-logs".
- Entry does NOT appear if permission missing (MenusService.getMenuForUser() filters by permissions).
- No 404 or error; simply omitted from array.

### R3: Group Placement

**Acceptance**:
- Entry grouped under "GESTIÓN" section in sidebar.
- Appears AFTER "Organizaciones" (order 80), with order=85.
- All four entries (Usuarios 60, Roles 70, Organizaciones 80, Auditoría 85) render together in order.

### R4: Icon Validation

**Acceptance**:
- Icon "file-text" is valid Lucide icon (test suite validates pattern `^[a-z][a-z0-9-]*$`).
- Icon renders correctly in sidebar (no fallback or placeholder).

### R5: Test Coverage Maintained

**Acceptance**:
- Existing tests (menu-map.spec.ts) pass without modification.
- CRITICAL-2: Validates route "/admin/audit-logs" exists in app.routes.ts.
- Order test: 75 unique, sequence 60 < 70 < 75 < 80.
- Icon test: "file-text" matches Lucide pattern.

---

## Scenarios

### Scenario 1: Master User Sees Audit Menu

```
Given master user (has READ audit-logs permission)
When MenusService.getMenuForUser(masterUser) is called
Then result includes entry:
  {
    label: "Auditoría de Acceso",
    route: "/admin/audit-logs",
    icon: "file-text",
    group: "GESTIÓN"
  }
```

### Scenario 2: Non-Master User Does NOT See Entry

```
Given operator user (no READ audit-logs permission)
When MenusService.getMenuForUser(operatorUser) is called
Then result does NOT include "Auditoría de Acceso"
And result is NOT empty (other items present)
And no error thrown
```

### Scenario 3: GESTIÓN Group Contains All Four

```
Given master user querying menu
When MenusService groups result by group
Then GESTIÓN contains [Usuarios, Roles, Organizaciones, Auditoría de Acceso]
And order is: 60, 70, 80, 85
And all 4 entries visible in same section
```

### Scenario 4: Order Uniqueness Maintained

```
Given MENU_MAP with new entry order=75
When npm test runs menu-map.spec.ts
Then test 'orders are unique and ascending' passes
And no duplicates detected
```

### Scenario 5: Icon Validation

```
Given menu entry icon='file-text'
When npm test runs Lucide pattern validator
Then icon matches ^[a-z][a-z0-9-]*$
And NOT error
```

### Scenario 6: Route Validation (CRITICAL-2)

```
Given MENU_MAP entry route='/admin/audit-logs'
When npm test validates routes against app.routes.ts
Then '/admin/audit-logs' route found in frontend app.routes.ts
And test passes (no 404 assertion)
```

### Scenario 7: Permission Filtering Works

```
Given user with READ audit-logs but WITHOUT READ organizations
When MenusService.getMenuForUser(user) filters
Then Auditoría de Acceso appears (has permission)
And Organizaciones does NOT appear (missing permission)
And GESTIÓN group contains only 2 of 4 items
```

### Scenario 8: Group NOT Omitted When Empty After Filter

```
Given hypothetical user with ONLY READ audit-logs (no other GESTIÓN perms)
When MenusService.getMenuForUser(user) is called
Then GESTIÓN group appears with only "Auditoría de Acceso"
And group NOT omitted (F1 D3 says: omit groups that become empty; this is NOT empty)
```

---

## Out of Scope

- Sidebar UI rendering (frontend responsibility).
- Permission grant logic (migration 0053 responsibility).
- MenusService filtering logic (already exists, no changes).
