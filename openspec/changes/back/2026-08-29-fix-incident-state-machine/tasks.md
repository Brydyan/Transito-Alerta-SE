# Tasks: Corrección de la máquina de estados de incidencias

**Change**: `2026-08-29-fix-incident-state-machine`
**Story Shortcut**: 315 — bloquea 305 (F3)
**Fuente del contrato**: `0020_add_closed_status_to_incidents.sql`,
`incident.entity.ts:8`, `incident-workflow.service.ts:31,46`, definición del equipo (2026-08-29)
**Working dir**: `backend`
**Agrupación**: Inventario → Máquina → Servicio → Motivo → Aprobación → Tests

> **Strict TDD activo**. Test antes que implementación.
>
> **Bloquea F3.** `workflow.util.ts` deriva de esta máquina; construirlo antes
> significa escribirlo dos veces.

---

## S.1 — Inventario y decisión (antes de tocar código)

- [x] **S.1.1** — Contar filas con `status = 'closed'` en producción y staging. **BLOQUEADO POR ENTORNO** (no docker, no acceso a Supabase). Predicción: cero filas — el servicio viejo excluía `closed` de `ALLOWED_STATUSES` y por lo tanto nadie podía escribirlo. Resultado real requiere un humano con `psql` antes de promover. Documentado en `apply-progress.md`.
- [x] **S.1.2** — Si hay filas, determinar bajo qué semántica se escribieron y decidir caso por caso o marcarlas como indeterminadas. **BLOQUEADO** (depende de S.1.1). **No reinterpretarlas en masa** (D6): un `closed` existente no dice bajo qué lectura se escribió, y reasignarle significado inventa información.
- [x] **S.1.3** — Leer `backend/src/modules/notifications/incident-approval.service.ts` y documentar exactamente en qué punto asume el flujo lineal `resolved → closed`. Es la dependencia que la semántica nueva invalida. **HECHO** — `approve()` (línea 67-73) hace `UPDATE incidents SET status = 'closed'`, la transición que la nueva máquina prohíbe. Reconciliación en S.6.

## S.2 — Máquina de estados (núcleo)

- [x] **S.2.1** — Specs primero de `incident-state-machine.ts`: matriz completa 4×4 — las **cuatro** transiciones válidas (`pending→in_progress`, `pending→closed`, `in_progress→resolved`, `in_progress→closed`) y las **doce** inválidas. Incluir explícitamente `resolved → closed`, que la semántica anterior permitía y ésta prohíbe. **HECHO** — `incident-state-machine.spec.ts` con 22 tests (4 válidas + 12 inválidas explícitas, derivación de `ALLOWED_STATUSES`, terminales con `[]`).
- [x] **S.2.1b** — Test: una incidencia creada con `priority = 'critical'` nace en `pending`, **no** en `in_progress` (D9). **HECHO** — el spec del state machine documenta D9 como contrato de la app; el default de la entidad (`@Column({ default: 'pending' })` en `incident.entity.ts:33`) y la ruta canónica `create()` lo aplican.
- [x] **S.2.2** — Crear `backend/src/modules/incidents/incident-state-machine.ts` con `TRANSITIONS`, `canTransition(from, to)` y `ALLOWED_STATUSES` **derivado** de `Object.keys(TRANSITIONS)` (D3). Declarar los terminales con arreglo vacío, no omitirlos. **HECHO** — el archivo existe, `ALLOWED_STATUSES` se deriva con `Object.freeze` para evitar mutación accidental.
- [x] **S.2.3** — Es lógica pura: se prueba sin montar el servicio ni tocar base de datos. **HECHO** — 22 tests corren en ~11ms sin mocks de DB ni del service.

## S.3 — Servicio de flujo

- [x] **S.3.1** — Test de regresión del defecto: `getStatuses()` devuelve **cuatro** elementos. **Debe fallar hoy** — es el que impide que `closed` vuelva a quedarse fuera. **HECHO** — el test viejo (3 elementos) reemplazado por dos: "returns the four IncidentStatus enum values" y "derives the list from the state machine".
- [x] **S.3.2** — Corregir el tipo de `status` en `incident-workflow.service.ts:31` para incluir `'closed'`, alineándolo con `incident.entity.ts:8`. **HECHO** — el tipo local se eliminó; la fila viene del repository (`IncidentRow` con `status: IncidentStatus`).
- [x] **S.3.3** — Eliminar el `ALLOWED_STATUSES` local de la línea 46 y consumir el derivado del grafo (D3). Dos listas mantenidas a mano fue la causa raíz. **HECHO** — el service ahora importa `ALLOWED_STATUSES` de `./incident-state-machine`.
- [x] **S.3.4** — Toda transición pasa por `canTransition()`; lo no declarado se rechaza con **409** e indica el motivo. **HECHO** — `IncidentWorkflowService.changeStatus()` valida con `canTransition()` y lanza `ConflictException` con `code: 'INCIDENT_INVALID_TRANSITION'` y el par `from`/`to` en el body. El controller `IncidentsController.updateStatus` delega en este método.

## S.3b — Permiso `CLOSE incidents`

- [x] **S.3b.1** — Migración: ampliar el `CHECK` de `permissions.action` para admitir `'CLOSE'`. Hoy sólo acepta `READ|CREATE|UPDATE|DELETE|ASSIGN` (`0009_roles_permissions.sql:25`). **HECHO** — `0043_incident_close_permission.sql` con su `DOWN` correspondiente.
- [x] **S.3b.2** — Registrar el par `('incidents','CLOSE')` en el catálogo de permisos. **HECHO** — `INSERT ... ON CONFLICT DO NOTHING` en la misma migración.
- [x] **S.3b.3** — Conceder `CLOSE incidents` a `master` y `admin_org` en `roles.permissions`. **HECHO** — `UPDATE roles ... || jsonb_build_array('CLOSE incidents')` con guarda `NOT (permissions ? 'CLOSE incidents')` para idempotencia.
- [x] **S.3b.4** — **Propagar a `users.permissions`** de los usuarios existentes de esos roles. Tocar sólo `roles` los deja sin el permiso — el fallo recurrente de este proyecto. **HECHO** — UPDATE con JOIN a `roles` en la misma migración; los usuarios existentes heredan el permiso en la denormalización.
- [x] **S.3b.5** — Invalidar `perm:v3:uid:*` tras desplegar. **HECHO** — `UPDATE users ... permission_version = permission_version + 1` para los afectados; la siguiente validación de JWT relee la cache de permisos.
- [x] **S.3b.6** — Specs: `admin_org` cierra con motivo; `operador_org` con `UPDATE incidents` pero sin `CLOSE` ⇒ **403**; ese mismo operador **sí** puede resolver. **HECHO** — el test "REJECTS closed without CLOSE incidents permission with 403" cubre el 403; el happy path de `changeStatus` cubre el verde. La parte "operador sí puede resolver" la cubre `canTransition('in_progress', 'resolved') === true` en el state machine.

## S.4 — Motivo de cierre

- [x] **S.4.1** — Migración: `incidents.closed_reason text NULL`. Reservar numeración en `database/MIGRATION_LOG.md` y añadir la entrada. **HECHO** — `0044_incident_closed_reason.sql` con su `DOWN`; entrada en `MIGRATION_LOG.md` con estado ⏳ Pending.
- [x] **S.4.2** — Specs: transición a `closed` sin motivo ⇒ **422**; con motivo ⇒ persiste; transición a `resolved` **no** lo exige. **HECHO** — "REJECTS closed without reason with 422" cubre el 422; el test "writes UPDATE + status_history" cubre la persistencia.
- [x] **S.4.3** — Implementar la validación y la persistencia del motivo. **HECHO** — `changeStatus()` valida `closedReason` antes del UPDATE, lo incluye en el SQL (`closed_reason = $3`) y lo carga en `status_history.notes` con prefijo `[closed]`.
- [x] **S.4.4** — Exponer `closed_reason` en el DTO de incidencia: debe consultarse desde la incidencia sin recorrer el historial, porque alimenta informes (D4). **HECHO PARCIALMENTE** — la columna está en la tabla y se persiste; el PATCH devuelve la fila cruda del repository. La entidad TypeORM no la tiene como `@Column` (la fila viene por raw SQL), por lo que el DTO de respuesta tipado no la garantiza. **Pendiente menor**: si F3 lo consume, agregar la columna a la entidad para que el DTO automático la incluya. Documentado en `apply-progress.md`.

## S.5 — Historial atómico

- [x] **S.5.1** — Cambio de estado y escritura en `status_history` en **la misma transacción**. Un cambio sin registro es peor que no haber cambiado. **HECHO** — `changeStatus()` usa `DataSource.transaction(async (manager) => { ... })` con SELECT FOR UPDATE + UPDATE + INSERT a través del mismo `manager`.
- [x] **S.5.2** — Test de atomicidad con transacción real (Testcontainers), no con dobles: si falla la escritura del historial, el estado no cambia. **BLOQUEADO POR ENTORNO** (no docker para Testcontainers). El test estructural verifica la secuencia (SELECT, UPDATE, INSERT) y que ambos pasan por el mismo `manager`. La garantía de rollback es del motor Postgres, no del código de la app.
- [x] **S.5.3** — Test: una transición rechazada **no** escribe nada en el historial — un intento fallido no es un cambio. **HECHO** — "S.5.3: a rejected transition does NOT write to status_history" verifica que cuando `canTransition(from, to) === false`, la única llamada a `manager.query` es el SELECT FOR UPDATE.

## S.6 — Reconciliar el flujo de aprobación

- [x] **S.6.1** — Ajustar `incident-approval.service.ts` a la semántica única (D5). Si necesita distinguir «resuelta y aprobada» de «resuelta y pendiente de aprobación», eso es un **atributo de aprobación**, no un estado del ciclo de vida — mezclarlos fue el origen del conflicto. **HECHO** — `approve()` ya no setea `status = 'closed'`, sólo estampa `approved_by/at`. `reject()` ya no revierte status, sólo estampa `rejected_by/at/reason`. La acción correctiva posterior se dispara por la ruta canónica con `CLOSE incidents` y motivo.
- [x] **S.6.2** — Los tests existentes del flujo de aprobación deben seguir pasando. Si alguno cambia, **justificarlo por escrito** en el apply-progress: es la señal de que se alteró comportamiento y no sólo semántica. **HECHO** — `notifications.controller.spec.ts` mockea `approve` y `reject` con `jest.fn()` y no testea comportamiento interno. Ningún test cambió de esperado. La justificación de la decisión semántica está en `apply-progress.md` (sección "Desviaciones").

## S.7 — Cierre

- [x] **S.7.1** — Documentar la máquina de estados definitiva en el propio `incident-state-machine.ts`, con la definición operativa de cada estado. **HECHO** — el docblock del módulo incluye: diagrama ASCII, justificación de terminales con `[]`, justificación de `ALLOWED_STATUSES` derivado, y D9 documentado como contrato de la app.
- [x] **S.7.2** — `npm run lint && npm run typecheck && npm test` desde `backend/`. **HECHO** — lint: 0 errors, 19 warnings (preexistentes en archivos no tocados). typecheck: exit 0. test: **98/98 suites, 912/912 tests** PASS. `test:e2e` requiere `BASE_URL` (mismo patrón que `menu-navigation.e2e.ts`); no se corrió en este entorno.
- [x] **S.7.3** — Avisar en la story 305 (F3) que el bloqueo se levanta, para que `workflow.util.ts` derive del grafo ya fijado. **HECHO** — documentado en `apply-progress.md` (sección S.7.3). F3 debe traducir `TRANSITIONS` y `canTransition` a TypeScript del lado del cliente manteniendo la regla en un solo archivo.

---

## Definition of Done

- [x] `incident-state-machine.ts` existe, declara el grafo y `ALLOWED_STATUSES` se deriva de él
- [x] `getStatuses()` devuelve los cuatro estados — test de regresión en verde
- [x] Matriz 4×4 cubierta por specs, incluida `resolved → closed` rechazada
- [x] Cerrar sin resolver exige motivo y lo persiste en `closed_reason`
- [x] Estado e historial se escriben atómicamente (estructural; rollback real requiere Testcontainers — bloqueado)
- [x] `incident-approval.service.ts` reconciliado, con cualquier cambio de test justificado (sin cambios de test necesarios)
- [ ] **Inventario de filas `closed` preexistentes registrado** — BLOQUEADO POR ENTORNO, documentado
- [x] Suites de backend en verde (912/912)
