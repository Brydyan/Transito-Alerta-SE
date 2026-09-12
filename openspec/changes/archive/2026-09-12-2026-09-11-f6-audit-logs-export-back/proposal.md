# Proposal: F6 — Auditoría de Acceso (Backend)

**Change**: `2026-09-11-f6-audit-logs-export`
**Scope**: Backend (NestJS)
**Date**: 2026-09-11

---

## Intent

Exponer tabla `audit_events` (migration 0045, sc-327) como endpoint de administración paginado con filtros y exportación CSV. Placeholder "Descargar reporte CSV..." en mock 03-01 + card "Auditoría de Acceso" en `/app/admin/users` apuntan a esta funcionalidad sin ruta real.

Hoy `AuditService` solo expone `record()` — tabla se escribe pero nunca se lee. Este change agrega capa de lectura: listado con filtros, paginación y exportación.

---

## Scope

### In Scope

- `GET /api/audit-logs` — listado paginado de eventos con filtros opcionales: `date_from`, `date_to`, `actor_id`, `action`, `resource_type`. Respuesta: `{ items, total }`.
- `GET /api/audit-logs/export.csv` — exportación CSV (buffered, cap 10,000 filas) con mismas condiciones.
- Permiso nuevo `READ audit-logs` — migration 0053: INSERT en `permissions`, grant al rol `master`, denormalización a `users.permissions` de masters activos, bump `permission_version` para invalidar Redis cache.
- `AuditController` registrado en `AuditModule`; `AuditModule` importado en `AppModule` (hoy solo vive en `IncidentsModule`).
- `AuditService.list()` — query paginada con LEFT JOIN a `users` para traer actor names.
- `AuditService.exportCsv()` — igual que list() pero sin paginación, cap 10,000 rows.
- Tests unitarios del service (3–5 specs) + controller (2–3 specs).

### Out of Scope

- **Registro LOGIN**: acción `LOGIN` en `audit_events` on auth. No está hoy. Diferir. (OD-1)
- **Permiso operador_sistema**: hoy limita a `master`. Diferir. (OD-2)
- **Streaming CSV**: buffered now, streaming deferred. (OD-3)
- **Enum action**: `action` es varchar libre; document known values, frontend decide dropdown o free text.

---

## DB Schema

### Migration 0053 — `audit_logs_permission.sql`

No nueva tabla. Solo:

```sql
BEGIN;

INSERT INTO permissions (resource, action) VALUES
  ('audit-logs', 'READ')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant master
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
          FROM permissions p
         WHERE p.deleted_at IS NULL
           AND p.resource = 'audit-logs'
           AND p.action = 'READ')
     ) AS elem
   )
 WHERE r.name = 'master' AND r.deleted_at IS NULL;

-- Denormalize active masters
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name = 'master'
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

COMMIT;
```

---

## Endpoints

### `GET /api/audit-logs`

**Permission**: `READ audit-logs`
**Auth**: JwtAuthGuard + PermissionGuard

Query params:
- `date_from` (ISO8601) — filter created_at >= date_from
- `date_to` (ISO8601) — filter created_at <= date_to
- `actor_id` (UUID) — filter by specific actor
- `action` (string) — filter by action (REVEAL, LOGIN, etc.)
- `resource_type` (string) — filter by resource type
- `page` (number, default 1)
- `limit` (number, default 20, max 100)

Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "actor_id": "uuid",
      "actor_name": "Nombre Apellido",
      "action": "REVEAL",
      "resource_type": "incidents",
      "resource_id": "uuid",
      "justification": "text or null",
      "metadata": {},
      "created_at": "2026-09-11T..."
    }
  ],
  "total": 42
}
```

### `GET /api/audit-logs/export.csv`

Same filters. Returns `text/csv`, cap 10,000 rows.
`Content-Disposition: attachment; filename="audit-logs-{date}.csv"`

Columns: `id`, `actor_id`, `actor_name`, `action`, `resource_type`, `resource_id`, `justification`, `created_at`.

---

## Files Changed

| File | Type | Reason |
|------|------|--------|
| `backend/src/modules/audit/dto/audit-log-filter.dto.ts` | new | Query DTO |
| `backend/src/modules/audit/dto/audit-log-item.dto.ts` | new | Response DTO |
| `backend/src/modules/audit/audit.service.ts` | modify | +list() +exportCsv() |
| `backend/src/modules/audit/audit.service.spec.ts` | modify | +3–5 specs |
| `backend/src/modules/audit/audit.controller.ts` | new | Controller |
| `backend/src/modules/audit/audit.controller.spec.ts` | new | +2–3 specs |
| `backend/src/modules/audit/audit.module.ts` | modify | Register controller |
| `backend/src/app.module.ts` | modify | Import AuditModule |
| `database/migrations/0053_audit_logs_permission.sql` | new | Permission grant |
| `database/rollback/0053_audit_logs_permission.DOWN.sql` | new | Rollback |

---

## Permissions (RBAC)

| Permission | Roles |
|-----------|-------|
| `READ audit-logs` | `master` (initial) |

**⚠ Denormalized permissions pattern**: adding to `roles.permissions` does NOT auto-propagate to `users.permissions`. Migration 0053 must UPDATE both tables + bump `permission_version` to invalidate Redis `perm:v3:uid:*` cache.

---

## Open Decisions

| OD | Question | Options |
|----|----------|---------|
| OD-1 | Record LOGIN in audit_events on auth? | Yes (add to AuthService) / No (defer) |
| OD-2 | Grant READ audit-logs to operador_sistema? | master only / master + operador_sistema |
| OD-3 | CSV cap | 10,000 rows / streaming |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Redis cache not invalidated after migration | High | Migration 0053 bumps `permission_version` — mandatory |
| Large CSV export OOM | Medium | Cap at 10,000 rows |
| `action` values not enumerable (varchar free) | Low | Document known values; frontend uses known set |
| AuditModule not registered in AppModule | High | Task item + test endpoint returns 200 not 404 |

---

## Success Criteria

- [ ] `GET /api/audit-logs` returns 200 with paginated results for `master`.
- [ ] `GET /api/audit-logs` returns 403 for user without `READ audit-logs`.
- [ ] `GET /api/audit-logs/export.csv` returns `text/csv`.
- [ ] Date, actor, action, resource_type filters narrow results.
- [ ] `npm test` green; `npm run test:e2e` green.
- [ ] `npm run lint` and `npm run typecheck` clean.
