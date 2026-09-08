# Proposal: F6 Roles Redesign

**Change**: `2026-09-08-f6-roles-redesign`  
**Scope**: Frontend UI redesign  
**Date**: 2026-09-08  

## What
Redesign roles admin list with ui-table, search, and permissions badge. Reuse ui-table component from Users change.

## Why
- F6 spec requirement (mock 04-01)
- Centralize role management with visual hierarchy

## Scope
- Roles list with table (NOMBRE | PERMISOS | ACCIONES)
- Search by role name
- Permissions badge (count)
- Stats cards (Total Permisos, Módulos Protegidos, Usuarios Asignados)
- Pagination
- Out: Edit role form (separate change)

## Definition of Done
- [ ] List renders 5 roles per mock
- [ ] Search filters by name
- [ ] Permissions badge shows count (48, 32, 24, etc.)
- [ ] Stats cards display correct numbers
- [ ] `pnpm test` passes
- [ ] E2E suite green
