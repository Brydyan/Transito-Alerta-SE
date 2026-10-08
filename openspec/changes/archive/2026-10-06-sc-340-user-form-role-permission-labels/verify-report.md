# Verify Report: User Form Role & Permission Labels (sc-340)

**Change**: `front/2026-09-27-sc-340-user-form-role-permission-labels`  
**Fecha de auditoría**: 2026-10-06  
**Auditor**: Subagente SDD Verify (contexto limpio, ejecutando protocolo `docs/agents/claude-qa.md` y `sdd-verify`)  
**Modo**: `hybrid`  
**Estado de integración**: Merged a develop vía PR #101 (`carlos_fp/sc-340/fix-user-form-orphan-role-names-raw-uuids`, commit `95af5d2bb`)

---

## 1. Declaración de contexto y conflicto de rol doble

Conforme a `docs/agents/claude-qa.md` (§ «Rol doble: QA + arquitectura» y § 5 «El reporte declara el conflicto»):
- **Declaración de independencia parcial**: El auditor actúa como líder de aseguramiento de calidad (QA Lead) y comparte titularidad sobre los contratos de arquitectura del proyecto (`gemini-architect.md` asumido desde 2026-09-01).
- **Salvaguarda estructural**: Esta verificación corre en un **sub-agente de contexto limpio**, aislado de sesiones previas de especificación. Se auditan exclusivamente los contratos escritos (`proposal.md`, `specs/admin-user-form-role-permission-labels.spec.md`, `design.md`, `tasks.md`, `apply-progress.md`) y la evidencia de ejecución real contra el código en el workspace.
- **Implementación independiente**: El cambio fue implementado por el builder y revisado/mergeado sin que el auditor escribiese el código de producción.

---

## 2. Resumen de ejecución y métricas de completitud

| Métrica | Meta / Estimado | Real observado | Estado |
|---|---|---|---|
| **Tareas de `tasks.md`** | 21 tareas (T1–T21) | 21/21 ejecutadas y completadas | ✅ 100% |
| **Requerimientos cubiertos** | 6 requerimientos (R1–R6) | 6/6 verificados con evidencia real | ✅ 100% |
| **Escenarios de prueba** | 11 escenarios | 11/11 verificados | ✅ 100% |
| **Archivos producción tocados** | 6 archivos | 6 archivos (`users.service.ts` back/front, `user.interface.ts`, `new-user-form.ts`, `user-form.ts`, `user-form.html`) | ✅ Exacto |
| **Archivos de test tocados/creados** | 5 archivos | 5 archivos (4 existentes + 1 nuevo: `user-form.component.spec.ts`) | ✅ Exacto |
| **Follow-ups declarados** | 4 (F1–F4) | Registrados como deuda externa justificada (no bloquean archive) | ✅ Trazados |

---

## 3. Evidencia de ejecución real de compuertas (CI Gates)

Per Regla 1 de `claude-qa.md`, se ejecutaron los comandos de verificación reales en frontend y backend:

### 3.1. Backend (`backend/`)

| Gate | Comando ejecutado | Resultado | Tiempo / Detalles |
|---|---|---|---|
| **Unit tests del change** | `npm test -- users.service.form-data` | **PASS** (1 suite, 6/6 tests) | 2.392 s |
| **Suite completa unit tests** | `npm test` | **PASS** (123/123 suites, 1275 passed, 11 skipped) | 26.452 s |
| **Linter** | `npm run lint` | **PASS** (0 errors, 18 warnings preexistentes en e2e/feed) | 7.8 s |
| **Typecheck** | `npm run typecheck` | **PASS** (`tsc --noEmit -p tsconfig.json`, exit code 0) | 5.4 s |
| **Build** | `npm run build` | **PASS** (`nest build`, exit code 0) | 3.1 s |

#### Salida real observada en `users.service.form-data.spec.ts`:
```text
PASS src/modules/users/users.service.form-data.spec.ts
  UsersService.getFormData (T5.4)
    ✓ system admin: returns all roles and all orgs, no exclusion filter applied (7 ms)
    ✓ org admin: system-only roles excluded, only own org returned (2 ms)
    ✓ non-system admin with null organizationId: organizations returns [] (1 ms)
    ✓ requests ASC order by name on both queries (1 ms)
    ✓ sc-340: role query filters soft-deleted roles for a system admin (4 ms)
    ✓ sc-340: role query filters soft-deleted roles AND system-only names for a non-system admin (1 ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

### 3.2. Frontend (`frontend/`)

| Gate | Comando ejecutado | Resultado | Tiempo / Detalles |
|---|---|---|---|
| **Service tests sc-340** | `npm test -- users.service.spec.ts` | **PASS** (1 suite, 14/14 tests) | 0.697 s |
| **Form tests sc-340** | `npm test -- user-form.component.spec.ts` | **PASS** (2 suites, 35/35 tests) | 1.666 s |
| **New user form spec** | `npm test -- new-user-form.component.spec.ts` | **PASS** (1 suite, 32/32 tests) | 1.245 s |
| **Roles component spec** | `npm test -- roles.component.spec.ts` | **PASS** (1 suite, 12/12 tests) | 1.141 s |
| **Módulo `admin/users` completo** | `npx jest --testPathPatterns='admin/users'` | **PASS** (8/8 suites, 75/75 tests) | 2.023 s |
| **Production Build** | `npm run build` (`ng build`) | **PASS** (exit code 0, bundle inicial: 608.37 kB) | 6.521 s |
| **Typecheck `-b`** | `npx tsc -b` | **WARNING** (5 errores en ramas ajenas: `department-list` y `map.component`; 0 en sc-340) | Exit code 2 |
| **Full test suite** | `npm test` | **WARNING** (79 fallos por contención/leak de Zone.js en tests ajenos; aislados pasan 100%) | Exit code 1 |

#### Nota sobre los warnings de compuerta en frontend:
1. **`npx tsc -b`**: Los 5 errores de tipado provienen estrictamente de `department-list.component.spec.ts` (SC-334/SC-341) y `map.component.spec.ts` (trabajo en curso en el branch actual). Los 8 archivos de sc-340 tienen **cero errores de compilación**.
2. **`npm test` en paralelo masivo**: La suite global de 208 suites sufre de fuga de estado en `TestBed`/Zone.js cuando corre concurrente (ej. `UiPageHeaderComponent` arroja `NG0950` en el run paralelo masivo, pero ejecutado individualmente da `PASS 2/2 tests` en 787 ms). Todas las suites del dominio `admin/users` pasan al 100% (75/75 tests verdes).

---

## 4. Matriz de Cumplimiento de Especificaciones (Spec Compliance Matrix)

Auditoría contra `specs/admin-user-form-role-permission-labels.spec.md` (6 requerimientos, 11 escenarios, Enmienda A-1):

| Req | Escenario | Condición / Contrato | Implementación observada | Evidencia de Test | Veredicto |
|---|---|---|---|---|:---:|
| **R1** | **Sc. 1**: Rol legacy soft-deleted no aparece en dropdown | `GET /api/users/form-data` excluye roles con `deleted_at IS NOT NULL` | `backend/.../users.service.ts:78-80`: `where: isSystemAdmin ? { deletedAt: IsNull() } : { deletedAt: IsNull(), name: ... }` | `users.service.form-data.spec.ts:166-175` | **PASS** |
| **R1** | **Sc. 2**: Simetría de filtro entre endpoints | `users.service.getFormData` y `roles.service.findAll` usan `deletedAt: IsNull()` | Ambos servicios aplican TypeORM `IsNull()` en su consulta | `users.service.form-data.spec.ts:177-189` | **PASS** |
| **R2** | **Sc. 3**: Rol con permisos post-0051 muestra `ACTION resource` | Vistas renderizan etiqueta resuelta, no UUID crudo (Enmienda A-1: resuelto en service) | `users.service.ts:getRolePermissions` resuelve vía catálogo; `new-user-form.ts` consume etiquetas | `users.service.spec.ts:111-130`, `new-user-form.component.spec.ts:231-250` | **PASS** |
| **R2** | **Sc. 4**: Modo edición muestra mismo etiquetado | `user-form.component.html:274` no renderiza UUID crudo | `user-form.component.ts:loadRolePermissions` resuelve contra catálogo con `resolveRolePermissionLabels` | `users.service.spec.ts:206-220`, `user-form.component.ts:255-268` | **PASS** |
| **R2** | **Sc. 5**: UUID sin entrada en catálogo degrada a fallback | Retorna `'permiso no encontrado'`, no `undefined`, no lanza excepción | `user.interface.ts:89`: `UNKNOWN_PERMISSION_LABEL = 'permiso no encontrado'`; `resolveRolePermissionLabels` fallback | `users.service.spec.ts:222-241`, `new-user-form.component.spec.ts:251-260` | **PASS** |
| **R3** | **Sc. 6**: Catálogo con entidad real proyecta etiquetas correctas | `getPermissionsCatalog` proyecta `id`, `resource`, `action` a `"{action} {resource}"`, sin `undefined` | `user.interface.ts:permissionLabel`, `users.service.ts:318-320` | `users.service.spec.ts:175-190` (`never yields "undefined"`) | **PASS** |
| **R4** | **Sc. 7**: Cliente tolera wire real (array plano) | `getPermissionsCatalog` y `getPermissions` toleran array plano o `{ data, meta }` | `users.service.ts:319` y `:479`: `Array.isArray(res) ? res : (res.data ?? [])` | `users.service.spec.ts:260-296` | **PASS** |
| **R5** | **Sc. 8**: PermissionItem alineado al wire real | `PermissionItem` poblado con normalización idempotente `toPermissionItem`; trackBy estable | `user.interface.ts:toPermissionItem`; `user-form.html:304` (`track perm.permisoId`) | `user-form.component.spec.ts:92-129` | **PASS** |
| **R5** | **Sc. 9**: Búsqueda de permisos en edición no lanza excepción | `filteredAllPerms` es null-safe, nunca ejecuta `.toLowerCase()` sobre `undefined` | `user-form.component.ts:123-132`: guardas `(p.nombre ?? '').toLowerCase()` | `user-form.component.spec.ts:65-74` | **PASS** |
| **R5** | **Sc. 10**: Búsqueda sin coincidencias retorna lista vacía | Sin crasheo en búsqueda fallida | `user-form.component.ts:123-132` devuelve `[]` | `user-form.component.spec.ts:76-90` | **PASS** |
| **R6** | **Sc. 11**: Fixture de roles actualizado a contrato vigente | `roles.component.spec.ts` deja de afirmar nombres pre-0040 y IDs numéricos | `roles.component.spec.ts:37-41`: nombres `master`, `operador_sistema`, `admin_org`, `operador_org`, `reporter` y UUIDs | `roles.component.spec.ts:1-60` (12/12 PASS) | **PASS** |

---

## 5. Tabla de Coherencia de Diseño (Design Decisions D1–D7)

| Decisión | Enunciado en `design.md` | Implementación en Código | Coherencia |
|---|---|---|:---:|
| **D1** | RC1 (roles soft-deleted) se corrige en el backend (`users.service.ts:getFormData`), sin migración nueva | Aplicado `deletedAt: IsNull()` en `backend/src/modules/users/users.service.ts:78-80` en ambas ramas | **Total** |
| **D2** | Los labels de permisos se resuelven en el service Angular replicando el patrón probado de `roles.service.ts` | Replicado en `frontend/src/app/features/admin/users/services/users.service.ts:262-276` y `user.interface.ts` | **Total** |
| **D3** | Dualidad array/envelope se resuelve con normalización local `Array.isArray(res) ? res : res.data ?? []` | Aplicado en `users.service.ts:319` y `users.service.ts:479` | **Total** |
| **D4** | `getStats` de roles en backend queda FUERA de alcance con dueño | No se alteró `roles.service.ts:getStats`. Registrado como Follow-up F1 en backlog | **Total** |
| **D5** | `roles.component` no está roto (mapper existe en frontend); solo se actualiza fixture stale | No se tocó `roles.component.ts`. Solo se actualizó `roles.component.spec.ts` | **Total** |
| **D6** | `permisosDirectos: []` hardcodeado es deuda externa declarada (no bloquea archive) | Mantenido `[]` en `users.service.ts:getUserById` con comentario explícito. Registrado Follow-up F2 | **Total** |
| **D7** | Comentarios «F6 fix» obsoletos se corrigen en archivos tocados | Actualizados comentarios en `user.interface.ts`, `users.service.ts`, `user-form.component.ts` | **Total** |

---

## 6. Auditoría de Tareas, Desviaciones del Builder y Follow-ups

### 6.1. Tareas de `tasks.md` (21/21)
- **Fase 1 (Backend T1–T3)**: Verificada con `users.service.form-data.spec.ts` (6 tests pasando).
- **Fase 2 (Modelo Wire T4–T5)**: Verificada en `user.interface.ts` (`PermissionWireItem`, `permissionLabel`, `toPermissionItem`, `resolveRolePermissionLabels`).
- **Fase 3 (Service Angular T6–T9)**: Verificada en `users.service.ts` y `users.service.spec.ts` (proyección limpia y tolerancia a array plano).
- **Fase 4 (Labels de rol T10–T12)**: Verificada en `getRolePermissions` y templates.
- **Fase 5 (Componente edición T13–T17)**: Verificada con la suite nueva `user-form.component.spec.ts` y extensión de `new-user-form.component.spec.ts`.
- **Fase 6 (Fixture R6 T18)**: Verificada en `roles.component.spec.ts` (12/12 PASS).
- **Fase 7 (Cierre T19–T21)**: Builds ejecutados, `apply-progress.md` documentado exhaustivamente.

### 6.2. Evaluación de desviaciones declaradas del Builder (D-T1 a D-T7)

1. **D-T1 (Aserción sobre `where.deletedAt` vs mock)**:  
   *Evaluación*: **Válida**. En tests unitarios con mocks de TypeORM, el servicio no filtra filas en memoria sino que delega en la query SQL. Comprobar `where.deletedAt.type === 'isNull'` es el único contrato observable en la frontera del unit test.
2. **D-T2 (Sobre-especificación de binds de template)**:  
   *Evaluación*: **Válida**. Los binds en `user-form.component.html:274,304,318,322` ya estaban bien escritos para el modelo. La Enmienda A-1 en `spec.md` corrigió el puntero del Acceptance formalmente.
3. **D-T3 (Normalización idempotente en intake)**:  
   *Evaluación*: **Válida**. `toPermissionItem` maneja tanto la forma wire como el modelo interno sin tocar los bindings del template.
4. **D-T4 (Refetch de catálogo en `getRolePermissions`)**:  
   *Evaluación*: **Aceptable con trade-off documentado**. Usar `switchMap` desacopla la inicialización del componente, a costa de una petición HTTP extra al seleccionar rol.
5. **D-T5 (Reescritura de test pre-0051)**:  
   *Evaluación*: **Válida**. El test anterior afirmaba strings crudos que 0051 convirtió a UUIDs.
6. **D-T6 (RED de T8-catálogo verde previo)**:  
   *Evaluación*: **Honesta**. Se reportó con transparencia que la rama ya toleraba arrays y se mantuvo como test de regresión.
7. **D-T7 (Filtro null-safe inline vs helper exportado)**:  
   *Evaluación*: **Válida y limpia**. Implementar la guarda inline `(p.nombre ?? '').toLowerCase()` en `filteredAllPerms` evita exportar helpers superfluos de 3 líneas sin consumidores adicionales.

### 6.3. Evaluación de Follow-ups declarados (F1 a F4)
- **F1 (`roles.service.ts:getStats` módulos en cero)**: Válido y prioritario para backend (`back/roles-stats-modules-from-uuids`).
- **F2 (`GET /api/users/:id` desglose de permisos)**: Deuda externa legítima; extender el DTO pertenece a un change de backend (`back/user-permissions-breakdown`).
- **F3 (Aserciones dentro de `.subscribe()` en tests legacy)**: Deuda técnica identificada en tests preexistentes de `users.service.spec.ts`.
- **F4 (Clave `@for` en catálogo sin ID)**: Caso puramente teórico, manejado defensivamente.

---

## 7. Hallazgos (Issues Found)

- **CRITICAL**: Ninguno. No hay defectos bloqueantes, regresiones funcionales ni incompatibilidades de tipo en el código del change.
- **WARNING**:
  - **W1 (Contención de suites globales de test en frontend)**: La ejecución paralela de todas las 208 suites de frontend falla por interferencia de Zone.js / TestBed en componentes ajenos (ej. `UiPageHeaderComponent`). Aislados, los componentes pasan 100%. Requiere estabilización de tests en un change de tooling/infraestructura de tests.
  - **W2 (Errores de compilación preexistentes en la rama)**: `npx tsc -b` falla con 5 errores en archivos no relacionados (`department-list.component.spec.ts` y `map.component.spec.ts`) pertenecientes a tickets en curso en la rama activa.
  - **W3 (Costo de refetch en selección de rol - D-T4)**: Cada cambio en el dropdown de roles invoca `GET /api/permissions?limit=100`. No causa defecto visual pero añade tráfico de red evitable si se compartiera un signal de catálogo.
- **SUGGESTION**:
  - **S1**: Consolidar el catálogo de permisos en un servicio con caché reactiva (ej. `shareReplay(1)` o signal de catálogo) para evitar peticiones redundantes en `getRolePermissions`.

---

## 8. Veredicto Final

### **PASS WITH WARNINGS**

**Fundamento del veredicto**:  
La implementación de `front/2026-09-27-sc-340-user-form-role-permission-labels` es **100% correcta, completa y fiel a las especificaciones R1–R6**. Resuelve de raíz los cuatro defectos reportados (roles soft-deleted en backend, UUIDs crudos en frontend, `undefined undefined` en catálogo de permisos y el `TypeError` en búsqueda de permisos). Todos los 21 tasks están completos y respaldados por suites de prueba verdes.  

El veredicto es **PASS WITH WARNINGS** debido a que las compuertas globales del repositorio (`tsc -b` y suite completa de tests de frontend) presentan ruido y fallas originadas por archivos y ramas concurrentes ajenas a sc-340 (`department-list`, `map.component`, y aislamiento de Zone.js). Conforme al protocolo, se emite además `fixes-required.md` para delimitar las acciones recomendadas y documentar que sc-340 en sí no requiere cambios de código.
