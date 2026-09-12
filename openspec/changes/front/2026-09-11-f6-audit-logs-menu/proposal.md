# Proposal: F6 — Auditoría de Acceso Menu Entry (Frontend)

**Change**: `2026-09-11-f6-audit-logs-menu` (frontend)
**Scope**: Sidebar menu rendering
**Date**: 2026-09-11
**Depends on**: `back/2026-09-11-f6-audit-logs-menu` (backend MENU_MAP entry + menu API)

---

## Intent

Validar que cuando el backend envía entrada "Auditoría de Acceso" en `GET /api/menus/my`, el sidebar frontend renderiza correctamente:
- Bajo grupo "GESTIÓN"
- Con ícono "file-text" (Lucide)
- Con ruta `/app/admin/audit-logs`
- Solo para usuarios con permiso READ audit-logs (backend ya filtra)

---

## Scope

### In Scope

- MenuService.getMenuFromBackend() recibe entry con `label="Auditoría de Acceso"`, `group="GESTIÓN"`, `icon="file-text"`, `route="/admin/audit-logs"`
- MenuService.transformBackendMenu() transforma correctamente a MenuItem
- Sidebar.component.ts agrupa por `group` → "GESTIÓN" contiene entrada
- sidebar.component.html renderiza entrada con:
  - Ícono "file-text" visible
  - Texto "Auditoría de Acceso" clickeable
  - routerLink="/app/admin/audit-logs"
- No render si usuario no tiene permission (backend responsibility, frontend just displays what arrives)

### Out of Scope

- Permission guard (backend filters before sending)
- API endpoint changes (GET /api/menus/my already exists)
- Sidebar CSS/styling (existing styles apply)
- Frontend route `/app/admin/audit-logs` implementation (already exists in app.routes.ts)

---

## Dependencies

**Blocking**:
- Backend SDD `2026-09-11-f6-audit-logs-menu` merged and deployed (MENU_MAP entry must exist)
- Migration 0053 executed (permission "READ audit-logs" must exist in DB)

**Non-blocking**:
- None

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `frontend/src/app/core/services/menu.service.ts` | none | No changes; already handles `group` and `icon` |
| `frontend/src/app/layout/sidebar/sidebar.component.ts` | none | No changes; already groups by `group` |
| `frontend/src/app/layout/sidebar/sidebar.component.html` | none | No changes; already renders icons + groups |

**Notes**: 
- Frontend is **already prepared** to handle the new entry (grouping + icon rendering is generic)
- When backend sends the entry, it will automatically appear in sidebar

---

## Test Coverage

- Unit: MenuService.transformBackendMenu() handles `group` and `icon` fields
- Integration: Sidebar renders grouped items, icons are valid Lucide names
- E2E: User with READ audit-logs permission sees "Auditoría de Acceso" under "GESTIÓN" group with file-text icon
- E2E: User without permission doesn't see entry (backend filters)

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Icon "file-text" not recognized by ui-icon | Low | Icon validator in spec covers (Lucide pattern); test catches |
| Route `/app/admin/audit-logs` doesn't exist in app.routes.ts | Low | CRITICAL-2 test in backend catches; must pass before frontend merge |
| groupedMenuItems computed doesn't handle `group` field | None | Already implemented, tested (F1 D3) |
| User without permission sees entry | None | Backend filters; frontend displays what arrives |

---

## Success Criteria

- [ ] Backend SDD merged and deployed
- [ ] `npm run lint` clean
- [ ] `npm run typecheck` clean
- [ ] `npm test` green (menu.service.spec.ts passes)
- [ ] Manual: Master user logged in → sidebar appears under "GESTIÓN" section → "Auditoría de Acceso" with file-text icon visible
- [ ] Manual: Click entry → navigates to `/app/admin/audit-logs`
- [ ] Manual: Non-master user (no READ audit-logs) → entry NOT visible in sidebar
- [ ] Sidebar shows 4 items under GESTIÓN: Usuarios (60), Roles (70), Organizaciones (80), Auditoría (85) in order
