# Archive Report — F6 Nuevo Usuario (back)

**Change**: `back/2026-09-08-f6-new-user-form`
**Archived**: 2026-09-09
**Verdict**: PASS
**Verify report**: `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-back/verify-report.md`

---

## Resumen

Cierra los dos gaps que impedían que la pantalla de mock 03-02 funcionara
end-to-end:

1. **`phone` ahora se persiste en el alta**. `AdminCreateUserDto` acepta
   `phone` (la columna existe desde `0035_domain_columns.sql`); el service
   lo guarda y lo devuelve en la respuesta.
2. **Permisos del rol se heredan al crear**. Cuando el admin envía
   `role_id`, el service denormaliza `roles.permissions` al array
   `users.permissions` del nuevo registro y ajusta
   `permission_version` (paridad con el path `adminUpdate` que ya lo hacía).

Además entrega la **fix CRITICAL C-1** de la primera verificación:
`POST /api/users` era inalcanzable porque el catálogo de permisos no
tenía las tuplas `(users, CREATE)` + `(users, DELETE)` para ningún rol
activo. La nueva migración `0049_admin_user_permissions.sql` (+ DOWN)
agrega esas dos tuplas + `(permissions, READ)` para `master`, las
denormaliza a los `users` existentes y bumpea `permission_version`.
Fase 6 (e2e `admin-create-user-roles`) cierra los 3 tasks B.4.5/6/7
que estaban bloqueados como "test manual".

## Archivos consultados

- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-back/proposal.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-back/spec.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-back/design.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-back/tasks.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-back/apply-progress.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-back/fixes-required.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-back/verify-report.md`

## Spec sincronizada

| Dominio nuevo                    | Acción  | Detalle |
|----------------------------------|---------|---------|
| `admin-user-creation-form-backend` | Creada | 7 requirements. Full copy, sin composición. |

- Origen: `openspec/changes/back/2026-09-08-f6-new-user-form/spec.md`
- Destino: `openspec/specs/admin-user-creation-form-backend/spec.md`
- Verificación mecánica: `diff -r` entre origen y destino = vacío (exit 0). Véase bloque de comandos en el resultado de la fase.

## Estado final (back)

- Tasks: **24/27 done** en `tasks.md`. 3 sin check (B.4.5, B.4.6, B.4.7) son "test manual" del DTO que requieren DB+seed corriendo localmente; los cubre el nuevo e2e `admin-create-user-roles` 4/4 PASS (Fase 6, B.6.1–B.6.5). El `verify-report.md` lo documenta explícitamente como "COVERED, not blocked" → archivado intencional con checkboxes stale reconciliados por la prueba e2e.
- Verdict: **PASS** — 0 CRITICAL, 2 WARNING, 2 SUGGESTION.
- Gates back: `rtk jest` 1036/1036 PASS, `rtk npm run lint` exit 0 (0 errors, 25 warnings pre-existentes), `rtk npm run typecheck` exit 0, `rtk npm run build` exit 0.
- CRITICAL cerrada: C-1 (catálogo de permisos → 45 tuplas, `master` con `CREATE users` + `DELETE users` + `READ permissions`; 0049 UP+DOWN+re-UP cycle verificado live: 45 → 42 → 45; nuevo e2e 4/4 PASS).
- WARNINGs: (W-1) reversibilidad de 0049 no está en el scope automatizado de `t7-rollback-cycle` (R36.2 confirma 49 UPs todas con DOWN; probado live aquí); (W-2) bug pre-existente de UP en `0043_incident_close_permission.sql`, propiedad de `t7-rollback-cycle`.
- SUGGESTIONs: cosmetic (incluye artefacto de idempotencia en DOWN+UP de 0049).
- E2E total backend: 56 suites / 480 tests / 660.6 s — 480/480 PASS. Incluye los 4 nuevos de Fase 6.

## Nota de archivado intencional

Los spec domains se separaron por decisión del orquestador: el back
cubre contrato de API y el front comportamiento de UI. La intención
original era componer ambos en un único `admin-user-creation-form/spec.md`,
pero el spec del back no tiene encabezados `ADDED`/`MODIFIED`/`REMOVED`
(es full spec, no delta), por lo que `sdd-archive-compose` no puede
mezclarlo con ADDED sin perder byte-identidad. El orquestador eligió la
opción 2 del blocker report del worker anterior: dominios separados,
sin composición. `admin-user-creation-form-backend/spec.md` queda como
home independiente del contrato API.

## Auditoría de movimiento

- Origen: `openspec/changes/back/2026-09-08-f6-new-user-form/`
- Destino: `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-back/`
- Mecanismo: `git mv` (origen rastreado, exit 0).
- Readback: `diff -r` snapshot pre-move vs destino = vacío (exit 0). `archive-report.md` es aditivo (no formaba parte del snapshot, excluido de la comparación).
