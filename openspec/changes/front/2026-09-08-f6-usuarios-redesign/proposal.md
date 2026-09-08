# Proposal: F6 Usuarios Redesign

**Change**: `2026-09-08-f6-usuarios-redesign`  
**Scope**: Frontend (UI redesign + *hasPermission in forms only)  
**Date**: 2026-09-08  

## What
Redesign users admin list with ui-table component, search, filters (role, organization), and pagination. Add *hasPermission guards only in edit/delete forms (not in list per D7 design decision).

## Why
- F6 spec requirement (mock 03-01)
- Centralize user management with visual hierarchy
- Prepare for D7 permission enforcement (backend 403 handling)

## Scope
- Users list component with table
- Search by name/email/role
- Filters: role dropdown, organization dropdown
- Pagination (1-based, 25 per page)
- E2E test suite
- Out: Edit/delete forms (F6.5.2+, separate change)

## Constraints
**D1**: No regression on existing specs  
**D7**: NO *hasPermission on list (show all buttons, let backend reject)  
**TDD**: Strict TDD — unit + e2e

## Definition of Done
- [ ] List renders 7 users per mock
- [ ] Search filters by name/email/role (local)
- [ ] Role & organization dropdowns work
- [ ] Pagination displays "1-7 of 25"
- [ ] Status badges show (Activo, Pendiente, Inactivo)
- [ ] Action buttons visible (eye, menu)
- [ ] `pnpm test` passes
- [ ] No lint errors
- [ ] E2E suite green
