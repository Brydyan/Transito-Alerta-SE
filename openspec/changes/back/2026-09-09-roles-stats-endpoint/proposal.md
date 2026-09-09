# Proposal: Roles Stats Endpoint

**Change**: `2026-09-09-roles-stats-endpoint`
**Scope**: Backend (NestJS)
**Bloquea**: `pnpm test` (frontend) — 2 tests en `roles.component.spec.ts:70,77`
**Date**: 2026-09-09

---

## Intent

Cerrar el gap que dejó el commit `9d19888c1` (2026-09-08 18:49)
cuando quitó `RolesComponent.loadStats()` del frontend porque el
endpoint no existía en el backend. El frontend siguió
renderizando las 3 stats cards del mock 04-01 con datos en
cero, y los tests del componente asumieron que la llamada seguía
ahí.

El endpoint `GET /api/roles/stats` que el frontend
(`RolesService.getRoleStats()` en
`frontend/src/app/features/admin/roles/services/roles.service.ts:58`)
consume nunca fue implementado en
`backend/src/modules/roles/roles.controller.ts`. Este change lo
agrega, junto con el service method y el DTO.

**Restauración del frontend** (que es la otra mitad del fix):
el `loadStats()` removido se vuelve a poner en
`RolesComponent.ngOnInit` con su `catchError` degradando a
ceros, para que si el endpoint no responde la UI no rompa.

---

## Scope

### In Scope (backend)

- Nuevo DTO `RoleStatsDto` (`totalPermissions`,
  `protectedModules`, `assignedUsers`).
- Nuevo método `RolesService.getStats()` que calcula los 3
  valores a partir de los repos de roles y users.
- Nuevo endpoint `GET /api/roles/stats` con permiso `READ`
  (universal para admins que ven la lista).
- Tests del service (3-4 specs).
- 0 migraciones — los datos se calculan on-the-fly.

### In Scope (frontend — change chico, dentro del mismo SDD)

- Restaurar `loadStats()` (18 líneas idénticas a las que
  quitó el commit 9d19888c1) en `RolesComponent.ngOnInit`.
- Verificar que `pnpm test` queda verde.

### Out of Scope

- **Cache de stats** — los conteos cambian raramente (asignar
  un rol afecta `assignedUsers`, sync de permissions afecta
  `totalPermissions`/`protectedModules`), pero el costo del
  cálculo es bajo (3 queries simples). Si la pantalla se vuelve
  lenta con miles de roles, se cachea después.
- **Stats filtradas por organización** — `getStats` devuelve
  totales globales. Los `admin_org` ven la misma página que
  `master`; si F7 quiere filtrar por org, lo agregamos.
- **Más métricas** (roles activos, roles sin uso, roles
  custom, distribución por recurso, etc.) — sólo las 3 que
  pide el mock 04-01 (124 / 12 / 85).
- **Reasignar fila admin-bootstrap al redeem** — pre-existente
  en T3.6, no relacionado.

---

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/modules/roles/dto/role-stats.dto.ts` | New | DTO de respuesta (3 campos) |
| `backend/src/modules/roles/roles.service.ts` | Modified | +1 método `getStats()` (~20 líneas) |
| `backend/src/modules/roles/roles.service.spec.ts` | Modified | +3-4 tests del `getStats` |
| `backend/src/modules/roles/roles.controller.ts` | Modified | +1 endpoint `@Get('stats')` antes de `:id` |
| `frontend/src/app/features/admin/roles/roles.component.ts` | Modified | Restaurar `loadStats()` + llamada en `ngOnInit` (18 líneas) |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| El cálculo de `totalPermissions` cuenta el mismo string 2 veces si 2 roles lo tienen | Med | Usar `Set<string>` (la propuesta ya lo hace). Test dedicado para verificar que duplicados se colapsan. |
| Performance con muchos roles (>1000) | Low | 3 queries simples, ~ms. Si se vuelve problema, cache con TTL. |
| Race condition si un rol se edita durante el cálculo | Low | Lectura sin transacción; los totales quedan levemente desfasados por nanosegundos. No afecta UX. |
| Permisos del catálogo (R6) cambian formato del string | Low | El shape `"ACTION resource"` está fijado desde T3.1 (0009_roles_permissions.sql). Si cambia, se actualiza el parser. |

---

## Rollback Plan

- Remover el DTO.
- Remover el método `getStats` y el endpoint.
- Frontend: revertir el `loadStats()` (queda como en 9d19888c1,
  con los 2 tests fallando otra vez — pero eso es lo que
  tenemos HOY hasta cerrar este change).
- 0 migraciones → 0 rollback de DB.

---

## Dependencies

- `user-management` (R4) — `users.roleId` y `users.deletedAt`
  ya tienen los soft-delete + role-assignment de T3.1 / T7.2.
- `auth` (R6/R7) — `PermissionGuard` con `@RequirePermission('READ')`
  ya está en patrón de los otros endpoints del controller.
- `front/2026-09-08-f6-roles-redesign/` (archivado) — la
  pantalla de roles espera los datos, pero ya renderiza
  placeholders sin error (no bloqueante).

---

## Success Criteria

- [ ] `GET /api/roles/stats` retorna 200 con
      `{totalPermissions, protectedModules, assignedUsers}`.
- [ ] Los 3 valores reflejan el estado actual de `roles` y
      `users` (excluyendo soft-deleted en ambos).
- [ ] Permiso denegado (sin `READ` permission) retorna 403.
- [ ] `pnpm test` (backend) verde; +3-4 nuevos tests pasan.
- [ ] Frontend `loadStats()` restaurado; los 2 tests
      fallidos (líneas 70, 77 de `roles.component.spec.ts`)
      pasan.
- [ ] `pnpm test` (frontend) verde; 509/509 o más.
- [ ] Si el endpoint falla en runtime, la UI degrada a
      0/0/0 sin romper (gracias al `catchError`).
