# Proposal: F6 — Auditoría de Acceso Menu Entry (Backend)

**Change**: `2026-09-11-f6-audit-logs-menu`
**Scope**: Backend (NestJS menu system)
**Date**: 2026-09-11
**Depends on**: `back/2026-09-11-f6-audit-logs-export` (migration 0053 + READ audit-logs permission must be merged first)

---

## Intent

Agregar entrada "Auditoría de Acceso" a MENU_MAP para que usuarios con permiso `READ audit-logs` vean el menú que apunta a `/app/admin/audit-logs`. Hoy el menú no existe; solo la ruta backend en SDD anterior.

---

## Scope

### In Scope

- Agregar 1 entrada a `backend/src/modules/menus/menu-map.ts`:
  - Label: "Auditoría de Acceso"
  - Route: "/admin/audit-logs"
  - Requires: "READ audit-logs"
  - Icon: "file-text" (lucide)
  - Group: "GESTIÓN"
  - Order: 75 (between Roles:70 and Organizaciones:80)
- Validación: menu-map.spec.ts cubre automáticamente (test CRITICAL-2 valida ruta existe + tests de order/icon).
- Comprobar que tests pasen sin editar specs.

### Out of Scope

- Cambios a `MenusService` (recorre MENU_MAP dinámicamente, sin lógica nueva).
- Cambios a `PermissionGuard` (ya valida permisos para rutas).
- Cambios a frontend (menú en UI es responsibility del frontend).

---

## Dependencies

**Blocking**:
- Migration 0053 (audit-logs permission grant) debe estar merged y ejecutada en BD.
- Frontend SDD debe incluir ruta `/app/admin/audit-logs` (ya incluida).

**Non-blocking**:
- Este change puede mergearse independientemente; si 0053 no se ejecutó, el menú simplemente no aparece (user no tiene permiso).

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `backend/src/modules/menus/menu-map.ts` | modify | Add 1 entry |

---

## Test Coverage

Tests existentes cubren automáticamente:
- **CRITICAL-2**: Valida que `/app/admin/audit-logs` exista en `app.routes.ts` (ya incluida en SDD frontend).
- **Lucide icon validator**: Verifica `file-text` es válido lucide.
- **Order uniqueness + ascending (D3)**: 75 entre 70 y 80 pasa automáticamente.
- **Non-empty set + no deletions (D4)**: Antirregresión.

**No requiere nuevos specs**.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Migration 0053 no ejecutada; menú no visible | Medium | Document precondition in PR; add task checklist |
| Icon `file-text` no es válido lucide | Low | Icon validator en tests rechazará inmediatamente |
| Order 75 duplica con otro | None | Order test valida unicidad |
| Ruta `/app/admin/audit-logs` no existe en frontend | Medium | CRITICAL-2 test fallará si ruta falta en app.routes.ts |

---

## Success Criteria

- [ ] MENU_MAP entry added with correct format.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` clean.
- [ ] `npm test` green (menu-map.spec.ts passes without edits).
- [ ] Manual: master user sees "Auditoría de Acceso" in sidebar with correct icon.
- [ ] Manual: non-master user does NOT see entry (no READ audit-logs permission).
