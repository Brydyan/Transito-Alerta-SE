# Archive Report — F6 Nuevo Usuario (front)

**Change**: `front/2026-09-08-f6-new-user-form`
**Archived**: 2026-09-09
**Verdict**: PASS WITH WARNINGS
**Verify report**: `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-front/verify-report.md`

---

## Resumen

Construcción de la pantalla `/app/admin/usuarios/new` siguiendo el mock
03-02-nuevo-usuario.png. Reemplaza el destino roto del botón "+ Nuevo
usuario" del listado (routerLink apuntaba a `nuevo` pero la ruta es
`new`). Layout en dos columnas (perfil + rol), formulario reactivo con
`OnPush`, lectura de catálogos vía `forkJoin`, vista previa de permisos
del rol seleccionado, validaciones cliente, submit a
`POST /api/users` (T5.6) y `POST /admin/users/invite` (T3.6), manejo
de foto con `atob`/dataURL. Cobertura TDD completa: 30 unit tests del
componente, 5 de `users.service`, 2 de `invitations.service`, 5 de
`app.routes.new-user-form`, 5 e2e Playwright (cierran las 3 CRITICAL
de la primera verificación).

## Archivos consultados

- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-front/proposal.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-front/spec.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-front/design.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-front/tasks.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-front/apply-progress.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-front/fixes-required.md`
- `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-front/verify-report.md`

## Spec sincronizada

| Dominio nuevo            | Acción  | Detalle |
|--------------------------|---------|---------|
| `admin-user-creation-form` | Creada | 11 requirements. Full copy (spec ya era full spec, no delta). Sin composición. |

- Origen: `openspec/changes/front/2026-09-08-f6-new-user-form/specs/admin-user-creation-form/spec.md`
- Destino: `openspec/specs/admin-user-creation-form/spec.md`
- Verificación mecánica: `diff -r` entre origen y destino = vacío (exit 0). Véase bloque de comandos en el resultado de la fase.

## Estado final (front)

- Tasks: **37/37 done** (Fase 1–9, conteo del artefacto persistido `tasks.md`; `verify-report.md` cita 36/36 — diferencia de 1 por tarea agregada fuera de Fase 1–9 después del snapshot del verificador).
- Verdict: **PASS WITH WARNINGS** — 0 CRITICAL, 3 WARNING, 3 SUGGESTION.
- Gates front: `rtk pnpm test` 548/551 (3 fallas pre-existentes, 0 nuevas), `rtk pnpm run build` exit 0 (chunk 22.68 kB), `rtk pnpm run lint` exit 1 (1 error pre-existente en `dashboard.component.ts:11`, 81 warnings pre-existentes), `tsc -b` exit 0, `rtk pnpm test:e2e` 33/33 (44 skipped sin backend local).
- CRITICAL cerradas: C-1 (regex `usuarios`→`users` en `app.routes.new-user-form.spec.ts:63-64` → 5/5 PASS), C-2 (mismo fix en `new-user-form.e2e.ts:102, 131, 205`), C-3 (dependencia del back: `0049_admin_user_permissions.sql` da al `master` `CREATE users` + `DELETE users` + `READ permissions`; nuevo e2e `admin-create-user-roles` 4/4 PASS en el back, ejercita la ruta que C-3 dejaba inaccesible).
- WARNINGs abiertas: (W-1) `apply-progress.md` no actualizado para los 2 fixes de front; (W-2) 3 escenarios del spec sin unit test; (W-3) e2e JPG via `Buffer`/`atob`.
- SUGGESTIONs: cosmetic code smells + artefacto de idempotencia en DOWN+UP de 0049.

## Nota de archivado intencional

Los spec domains se separaron por decisión del orquestador: el front
cubre comportamiento de UI y el back contrato de API. La intención
original era componer ambos en un único `admin-user-creation-form/spec.md`,
pero el spec del back no tiene encabezados `ADDED`/`MODIFIED`/`REMOVED`
(es full spec, no delta), por lo que `sdd-archive-compose` no puede
mezclarlo con ADDED sin perder byte-identidad. El orquestador eligió la
opción 2 del blocker report del worker anterior: dominios separados,
sin composición. Ambos quedan como `openspec/specs/{front,back}/spec.md`
independientes.

## Auditoría de movimiento

- Origen: `openspec/changes/front/2026-09-08-f6-new-user-form/`
- Destino: `openspec/changes/archive/2026-09-09-2026-09-08-f6-new-user-form-front/`
- Mecanismo: `git mv` (origen rastreado, exit 0).
- Readback: `diff -r` snapshot pre-move vs destino = vacío (exit 0). `archive-report.md` es aditivo (no formaba parte del snapshot, excluido de la comparación).
