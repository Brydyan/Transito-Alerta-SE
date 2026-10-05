# Tasks: User form role & permission labels (sc-340)

**Change**: `front/2026-09-27-sc-340-user-form-role-permission-labels`
**Fecha**: 2026-09-27
**Strict TDD**: ACTIVO (`openspec/config.yaml` → `testing.strict_tdd: true`). Cada task de
tests es **RED primero**: se escribe el test fallando, se ve fallar, recién ahí se implementa.
**Delivery strategy**: `ask-on-risk`.
**Estado**: **21/21 tareas completas** (sincronizado 2026-09-30 con `apply-progress.md`).
Los follow-ups F1–F4 siguen abiertos a propósito: son deuda externa declarada, no tareas de
este change.

## Runners (verificados contra `package.json`, no asumidos)

| lado | tests | build | notas |
| --- | --- | --- | --- |
| frontend | `pnpm test` (jest) | `pnpm run build` (`ng build`) | `pnpm test:e2e` es playwright, no corre en este change |
| backend | `npm test` (jest) | `npm run build` (`nest build`) | desde `backend/` |

⚠️ `openspec/config.yaml` declara `working_dir: backend`, pero este change es mayormente
frontend. Los runners de arriba están leídos de los `package.json` reales.

---

## Fase 1 — Backend (RC1)

- [x] **T1** — Test RED de `getFormData` en `backend/src/modules/users/users.service.form-data.spec.ts`:
      el repo mockeado devuelve un rol con `deletedAt` definido y uno con `deletedAt: null`;
      se afirma que la respuesta **excluye** el soft-deleted. El test DEBE fallar contra el
      código actual. Cubre: **R1**.
- [x] **T2** — Aplicar `deletedAt: IsNull()` al `where` de la consulta de roles en
      `backend/src/modules/users/users.service.ts:64-89` (`getFormData`). Cubre: **R1**.
- [x] **T3** — Test GREEN + test de simetría: `getFormData` y `roles.service.findAll` devuelven
      el mismo conjunto para la misma base. Cubre: **R1**.

**Gate fase 1**: `cd backend && npm test -- users.service.form-data` verde.

## Fase 2 — Modelo del wire (frontend)

- [x] **T4** — Declarar la forma real del wire en
      `frontend/src/app/features/admin/users/models/user.interface.ts`: `PermissionWireItem`
      (`id`, `resource`, `action`, `deleted_at`) y la unión
      `array plano | { data, meta }`. Alinear `PermissionItem` con lo que el template ya
      consumía (`permisoId`, `nombre`, `recurso`, `accion`) para no propagar el rename.
      Cubre: **R3**, **R4**.
- [x] **T5** — Extraer el resolvedor de etiqueta como función pura testeable
      (`permissionLabel`): `nombre` explícito si existe, si no `"${action} ${resource}"`,
      si no cadena vacía. **Sin `any`.** Cubre: **R2**, **R3**.

## Fase 3 — Service de Angular (RC3, RC4)

- [x] **T6** — Test RED de `getPermissionsCatalog` en `frontend/src/app/features/admin/users/services/users.service.spec.ts`:
      respuesta con una entrada que solo trae `id`/`resource`/`action`; se afirma que NO
      aparece la cadena `undefined`. Cubre: **R3**.
- [x] **T7** — Reescribir la proyección de `getPermissionsCatalog`
      (`users.service.ts:277-283`) usando `p.action`/`p.resource` y el resolvedor de T5,
      replicando `roles.service.ts:167-172`. Cubre: **R3**.
- [x] **T8** — Test RED con respuesta **array plano** (sin envelope) para `getPermissionsCatalog`
      y `getPermissions`; el test DEBE fallar contra el `res.data` asumido hoy
      (`users.service.ts:267,278,425-431`). Cubre: **R4**.
- [x] **T9** — Reemplazar el acceso a `.data` por la normalización `Array.isArray(res) ? res : res.data ?? []`,
      replicando `roles.service.ts:157-162`. Cubre: **R4**.

## Fase 4 — Resolución de labels de rol (RC2)

- [x] **T10** — Test RED: `getRolePermissions` con un rol cuyos `permissions` son UUIDs debe
      devolver etiquetas `"{action} {resource}"` resoltas contra el catálogo; y con un UUID
      ausente del catálogo debe devolver un marcador explícito, no `undefined` ni excepción.
      Cubre: **R2**.
- [x] **T11** — Implementar la resolución en `getRolePermissions` reutilizando el catálogo ya
      cargado; sin strings `"ACTION resource"` hardcodeados. Cubre: **R2**.
- [x] **T12** — Render de etiquetas resueltas en
      `new-user-form.component.html:238` y `user-form.component.html:274`; dejar de imprimir
      el valor crudo. Corregir de paso los comentarios «F6 fix» obsoletos de los archivos que
      este change toca (D7). Cubre: **R2**.

## Fase 5 — Componente de edición (RC4, R5)

- [x] **T13** — Test RED de `filteredAllPerms` en el **nuevo**
      `frontend/src/app/features/admin/users/user-form/user-form.component.spec.ts` (no existe
      hoy): escribir en el buscador NO DEBE lanzar `TypeError`; y una búsqueda sin
      coincidencias devuelve lista vacía. Cubre: **R5**.
- [x] **T14** — Hacer `filteredAllPerms` null-safe (`user-form.component.ts:119-124`): nunca
      llamar `.toLowerCase()` sobre un campo ausente. Cubre: **R5**.
- [x] **T15** — Test RED de render: con permisos en la forma del wire, cada fila muestra
      etiqueta legible y el `trackBy` recibe un identificador real (no `undefined`).
      Cubre: **R5**.
- [x] **T16** — Corregir `trackBy` y los binds de `user-form.component.html:304,318,322` para
      consumir el modelo alineado. Cubre: **R5**.
- [x] **T17** — Extender `new-user-form.component.spec.ts` con el caso de render de permisos
      de rol con UUIDs. Cubre: **R2**.

## Fase 6 — Evidencia honesta (R6)

- [x] **T18** — Actualizar el fixture stale de `roles.component.spec.ts:31-35`: nombres de rol
      post-0040 e identificadores del contrato vigente. El fixture actual afirma un contrato
      que el código ya no cumple. Cubre: **R6**.

## Fase 7 — Cierre

- [x] **T19** — `cd frontend && pnpm test` (todo PASS) y `pnpm run build` (exit 0).
- [x] **T20** — `cd backend && npm test` verde, sin regresiones.
      ⚠️ Condición de corrida: la suite es verde **cuando corre sola** (verificado 123/123 en
      23.9 s). Bajo contención de CPU (p. ej. frontend y backend en paralelo) puede aparecer un
      fallo espurio: `core/storage/noop-storage.client.spec.ts` excede su timeout de 5 s. Ese
      spec no lo toca este change y aislado pasa en 14 ms. Ver «Fallas ambientales» en
      `apply-progress.md`.
- [x] **T21** — Actualizar `apply-progress.md` con el estado real, checks fallidos si los hay, y
      los follow-ups de abajo. **No** sincronizar `openspec/specs/` (lo hace `sdd-archive`).

---

## Review Workload Forecast

| Métrica | Valor |
| --- | --- |
| Líneas cambiadas estimadas (additions + deletions) | **~310** |
| Archivos de producción tocados | 6 |
| Archivos de test tocados | 5 (4 existentes + 1 nuevo) |
| Migraciones DB | 0 |
| **Chained PRs recommended** | **No** |
| **400-line budget risk** | **Low** |
| **Decision needed before apply** | **No** |

El diff está por debajo de las 400 líneas, así que `ask-on-risk` no dispara antes de apply.
Si al implementar el diff real pasa las 400, **parar y preguntar** antes de commitear: la
estrategia cacheada sigue siendo `ask-on-risk`, no `auto-chain`.

---

## Follow-ups declarados (deuda externa, con dueño — NO bloquean archive)

- [ ] **F1 — `getStats` no cuenta módulos** (fuera de alcance, D4).
      `backend/src/modules/roles/roles.service.ts:155-160` hace `perm.split(' ')` sobre
      `roles.permissions`, que tras `0051` contiene **UUIDs** → `parts.length` siempre `1` →
      `modules` siempre vacío → la card de módulos de `/app/admin/roles` está en cero.
      El comentario en `:148-150` advierte este modo de falla y 0051 ya lo provocó.
      Requiere resolver los UUIDs contra el catálogo de permisos. **Change sugerido:**
      `back/roles-stats-modules-from-uuids`.
- [ ] **F2 — el desglose de permisos del usuario no existe** (fuera de alcance, D6).
      `GET /api/users/:id` no devuelve `permisosDirectos`/`permisosRol`, así que
      `users.service.ts:129-135` los deja hardcodeados en `[]` y ningún permiso aparece
      pre-marcado al editar. La «lista de permisos» que el ticket reporta vacía **queda
      resuelta por R4/R5** (esa lista viene del catálogo); lo que falta es el pre-check.
      Extender el DTO de usuario toca consumidores de auditoría → change aparte.
      **Change sugerido:** `back/user-permissions-breakdown`.
- [ ] **F3 — aserciones vacías dentro de `.subscribe()`** (descubierto durante el apply).
      `expect()` colocado dentro de `.subscribe()` **pasa vacío** en este repo: RxJS 7 entrega
      el error de forma asíncrona y nunca llega a Jest. Verificado empíricamente con una
      aserción imposible que igual pasó. Los tests sc-340 usan capture-then-assert fuera del
      subscribe, pero los tests F6 preexistentes en `frontend/.../users.service.spec.ts`
      (`getFormData`, `createUserJson`, `uploadAvatar`) siguen con ese patrón y **no prueban
      nada**. No se tocaron por estar fuera del radio de impacto de sc-340.
      **Change sugerido:** `front/replace-vacuous-subscribe-assertions`.
- [ ] **F4 — clave de `@for` degenerada sin `id`** (teórico).
      Una entrada de catálogo sin `id` recibe `permisoId: ''` y `@for` volvería a avisar claves
      duplicadas. El wire real siempre trae la PK, así que es teórico. Si aparece, el fix es un
      `trackBy` por índice compuesto.

## Trazabilidad

| R<n> | Test |
| --- | --- |
| R1 | `backend/.../users.service.form-data.spec.ts` (T1, T3) |
| R2 | `frontend/.../users.service.spec.ts` (T10) + `new-user-form.component.spec.ts` (T17) |
| R3 | `frontend/.../users.service.spec.ts` (T6) |
| R4 | `frontend/.../users.service.spec.ts` (T8) |
| R5 | `frontend/.../user-form.component.spec.ts` (T13, T15) |
| R6 | `frontend/.../roles.component.spec.ts` (T18) |
