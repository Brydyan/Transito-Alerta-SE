# Proposal: F6 — Auditoría de Acceso (Frontend)

**Change**: `2026-09-11-f6-audit-logs-export`
**Scope**: Frontend (Angular)
**Depends on**: `back/2026-09-11-f6-audit-logs-export` (backend must deploy first)
**Date**: 2026-09-11

---

## Intent

Reemplazar placeholder `<a href="#">Descargar reporte CSV...</a>` del mock 03-01 (card "Auditoría de Acceso" en `/app/admin/users`) con ruta real `/app/admin/audit-logs` que muestre tabla de eventos de auditoría con filtros + botón CSV.

---

## Scope

### In Scope

- Ruta `/app/admin/audit-logs` bajo árbol `admin`, gateada con `permissionGuard` + permiso `READ audit-logs`.
- `AuditLogsComponent` — página con:
  - Tabla: columnas `Fecha`, `Usuario (actor)`, `Acción`, `Recurso`, `Recurso ID`, `Justificación`.
  - Filtros: date_from/date_to, dropdown usuario (actorId).
  - Paginación (mismo patrón `app-pagination`).
  - Botón "Descargar CSV" → `GET /api/audit-logs/export.csv`.
- `AuditLogsService` — HTTP service: `getAuditLogs(filters, page, limit)` + `exportCsv(filters)` (blob download).
- Update `users-list.component.html`: reemplazar `href="#"` con `[routerLink]="['/app/admin/audit-logs']"`.
- Breadcrumb: `Administración > Auditoría de Acceso` (breadcrumb service auto-construye).

### Out of Scope

- Filtro action dropdown — diferir hasta conocer valores estables (OD-1 backend).
- Filtro resource_type — edge case, diferir.
- Real-time updates / WebSocket.

---

## Route Definition

```typescript
{
  path: 'audit-logs',
  data: { breadcrumb: 'Auditoría de Acceso' },
  canActivate: [permissionGuard],
  loadComponent: () =>
    import('./features/admin/audit-logs/audit-logs.component').then(
      (m) => m.AuditLogsComponent,
    ),
}
```

**Note**: `permissionGuard` debe leer `data.permission = 'READ audit-logs'` si la data no se pasa vía route data. Verify guard implementation.

---

## API Contract (Consumed)

- `GET /api/audit-logs?page=1&limit=20&date_from=...&date_to=...&actor_id=...`
  Returns `{ items: AuditLogItem[], total: number }`.
- `GET /api/audit-logs/export.csv?date_from=...&date_to=...&actor_id=...`
  Returns `text/csv` blob. Trigger browser download con `Content-Disposition: attachment`.

---

## Files Changed

| File | Type | Reason |
|------|------|--------|
| `frontend/src/app/features/admin/audit-logs/audit-logs.component.ts` | new | Page component |
| `frontend/src/app/features/admin/audit-logs/audit-logs.component.html` | new | Table + filters + CSV button |
| `frontend/src/app/features/admin/audit-logs/audit-logs.component.spec.ts` | new | Unit test |
| `frontend/src/app/features/admin/audit-logs/services/audit-logs.service.ts` | new | HTTP service |
| `frontend/src/app/features/admin/audit-logs/services/audit-logs.service.spec.ts` | new | Service unit test |
| `frontend/src/app/app.routes.ts` | modify | Add `/app/admin/audit-logs` route |
| `frontend/src/app/features/admin/users/users-list/users-list.component.html` | modify | Replace `href="#"` with `routerLink` |

---

## Open Decisions

| OD | Question | Default |
|----|----------|---------|
| OD-F1 | Actor filter: dropdown (load users list) o UUID input? | Dropdown — load from `GET /api/users/form-data` |
| OD-F2 | Date range: native `<input type="date">` o date-picker component? | Native input (no extra dependency) |
| OD-F3 | CSV download: blob URL or HTTP blob service? | Service blob (handles auth cookies correctly) |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `permissionGuard` doesn't read `data.permission` | Medium | Verify guard before coding; add test |
| Backend not deployed → all 404 | High | This depends on backend; deploy backend first |
| User dropdown requires `READ users` | Medium | Fallback to UUID text input if 403 |
| CSV auth cookies (withCredentials) | Low | Use `HttpClient` blob, not `window.open()` |

---

## Success Criteria

- [ ] `/app/admin/audit-logs` route loads `AuditLogsComponent`.
- [ ] `master` user sees audit events table.
- [ ] Non-`READ audit-logs` user blocked by `permissionGuard`.
- [ ] Date filters narrow results correctly.
- [ ] Actor filter (dropdown/UUID) narrows results.
- [ ] CSV button triggers file download.
- [ ] Breadcrumb shows `Administración > Auditoría de Acceso`.
- [ ] `users-list.component.html` card links to `/app/admin/audit-logs`.
- [ ] `pnpm test` green; `pnpm run typecheck` clean.
