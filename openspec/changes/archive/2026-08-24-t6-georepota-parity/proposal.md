# Proposal: T6 — GeoReporta Parity Gaps (Fase 6 Backend)

**Change**: t6-georepota-parity  
**Date**: 2026-08-23  
**Author**: Gemini Architect (via Claude Code)  
**Shortcut**: sc-275 (story principal), sub-tasks sc-276 a sc-283  
**Epic**: ⚠️ GeoReporta  

---

## Intención

La auditoría exhaustiva GeoReporta→TASE del 2026-08-23 identificó 23 gaps que dejan la paridad funcional en ~78-82%. Este change cierra esos gaps en 8 grupos ordenados por prioridad de bloqueo, llevando el backend a ≥95% de paridad funcional.

Los gaps cubren tres clusters:

1. **Mismatches de API** que rompen el frontend existente sin ningún cambio de código cliente (P1)
2. **Integridad de datos** — columnas faltantes que destruyen audit trail y SLA (P1/P2)
3. **Features y aliases** — funcionalidad nueva o paths de compatibilidad (P3/P4)

---

## Alcance

### T6.1 — Fix críticos de API (P1, sin migraciones)
- **G10**: `GET /notifications/unread-count` → `{unread_count: N}` (actualmente path `/unread` y key `unread`)
- **G6**: `GET /organizations/notified-for` acepta `?location_id&category_id` además de `?lat&lng`; añadir `is_claimable` en respuesta

### T6.2 — Soft Deletes (P1, migraciones 0025-0026)
- **G3**: `incidents.deleted_at TIMESTAMPTZ NULL` — `softDelete()` actual es un stub no-op; necesita implementación real
- **G9**: `assignments.deleted_at TIMESTAMPTZ NULL` + partial UNIQUE index `WHERE deleted_at IS NULL`; `release()` hace hard delete

### T6.3 — Columnas de métricas (P2, migración 0027)
- **G4**: `incidents.claimed_at TIMESTAMPTZ NULL` — `claim()` setea `claimed_by` pero nunca `claimed_at`
- **G5**: `incidents.resolution_date TIMESTAMPTZ NULL` — actualmente derivado en memoria como `updated_at` cuando `status='resolved'`

### T6.4 — Assignment role-change (P2, sin migración)
- **G8/G16**: `UpdateAssignmentDto` solo acepta `operator_id`; `AssignmentEntity.role` existe pero no es editable vía PATCH

### T6.5 — Email OTP + columnas compliance (P2, migración 0028)
- **G7**: 5 columnas faltantes en `users`: `email_verified_at`, `verification_otp`, `verification_otp_expires_at`, `terms_accepted_at`, `terms_version`
- **G11**: Módulo de verificación OTP completo: `POST /email/verify-otp`, `POST /email/resend-verification`

### T6.6 — Incident image upload (P3, migración 0029)
- **G2**: `POST /incidents` sin soporte multipart; sin `IncidentImagesService`; sin tabla `incident_images`

### T6.7 — Export XLSX/PDF + Feed Recovery + SSE tombstone (P3, sin migraciones nuevas)
- **G12**: Export solo CSV; sin `format` query param; path `exportar` vs `export`
- **G15**: Sin `@nestjs/schedule`; sin `POST /admin/feed/rebuild`; Redis flush → feed irrecuperable
- **G13**: `GET /notifications/stream` → 404; debe ser 410 Gone con mensaje de migración a Socket.IO

### T6.8 — Path aliases + GDPR anonymizer (P4, posible migración users.deleted_at)
- **G14**: `GET /menus/my` alias
- **G17**: `GET /invitations/{token}/preview` path-param alias
- **G18**: `POST /invitations/accept` alias
- **G20**: `GET /estados` alias
- **G19**: `UsersService.softDelete()` actual no anonimiza PII; `users.deleted_at` ausente
- **G23**: `POST /register` debe responder 410 Gone

---

## Fuera de alcance (eliminaciones intencionales confirmadas)

| Feature GeoReporta | Razón |
|---|---|
| `POST /auth/google` Firebase auth | Reemplazado por device UUID + invitation model (D1) |
| `GET /notifications/stream` SSE | Reemplazado por Socket.IO (T2.5) — solo tombstone 410 en T6.7 |
| `POST /register` open registration | Invitation-only model — tombstone 410 en T6.8 |
| Export PDF | Baja demanda; XLSX cubre la necesidad principal |

---

## Migraciones de BD nuevas

| # | Nombre | Scope | Task |
|---|---|---|---|
| 0025 | `incidents_soft_delete` | `incidents.deleted_at TIMESTAMPTZ NULL` | T6.2 |
| 0026 | `assignments_soft_delete` | `assignments.deleted_at TIMESTAMPTZ NULL` + partial UNIQUE | T6.2 |
| 0027 | `incidents_metrics_cols` | `incidents.claimed_at` + `incidents.resolution_date` | T6.3 |
| 0028 | `users_otp_compliance` | 5 columnas en `users` | T6.5 |
| 0029 | `incident_images` | tabla + permisos + grants | T6.6 |

> Verificar `database/MIGRATION_LOG.md` antes de crear cualquier migración — los slots 0025+ están libres al 2026-08-23.

---

## Dependencias de dominio

```
T6.1  → notifications module, organizations module, geofencing service
T6.2  → incidents module, assignments module
T6.3  → incidents module (workflow service, repository, export service, feed service)
T6.4  → assignments module
T6.5  → users module, auth module, mail module (T3.5 outbox)
T6.6  → incidents module, comment-images pattern (T5.5 reference)
T6.7  → incidents module (export service, feed service), notifications module
T6.8  → menus, invitations, incidents (statuses), users, auth
```

---

## RBAC — permisos nuevos/modificados

| Recurso | Acción | Quién | Task |
|---|---|---|---|
| `email-verification` | CREATE | usuario autenticado propio | T6.5 |
| `incident-images` | CREATE | owner del incidente / staff con permiso | T6.6 |
| `incident-images` | DELETE | owner / staff con permiso | T6.6 |
| `feed` | ADMIN | `admin_sistema` | T6.7 (feed rebuild) |

---

## Riesgo / impacto

| Riesgo | Mitigación |
|---|---|
| Soft-delete incidents rompe queries existentes que no filtran `deleted_at` | Fase tasks.md lista cada archivo/query a actualizar |
| `resolution_date` columna real vs valor computado — Export y Feed tienen código que la computa | Fase tasks lista ambos archivos; tests de regresión existentes deben pasar |
| Migración 0027 en Supabase requiere apply manual (CC3) | Mismo proceso que 0001-0024 |
| `@nestjs/schedule` cambia el ciclo de vida del módulo | Probar con e2e que no interfiere con Testcontainers shutdown |
