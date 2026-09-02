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

- [ ] **S.1.1** — Contar filas con `status = 'closed'` en producción y staging. Lo previsible es cero: el servicio nunca pudo escribir ese estado (`ALLOWED_STATUSES` lo excluye). Registrar el resultado en el apply-progress.
- [ ] **S.1.2** — Si hay filas, determinar bajo qué semántica se escribieron y decidir caso por caso o marcarlas como indeterminadas. **No reinterpretarlas en masa** (D6): un `closed` existente no dice bajo qué lectura se escribió, y reasignarle significado inventa información.
- [ ] **S.1.3** — Leer `backend/src/modules/notifications/incident-approval.service.ts` y documentar exactamente en qué punto asume el flujo lineal `resolved → closed`. Es la dependencia que la semántica nueva invalida.

## S.2 — Máquina de estados (núcleo)

- [ ] **S.2.1** — Specs primero de `incident-state-machine.ts`: matriz completa 4×4 — las **cuatro** transiciones válidas (`pending→in_progress`, `pending→closed`, `in_progress→resolved`, `in_progress→closed`) y las **doce** inválidas. Incluir explícitamente `resolved → closed`, que la semántica anterior permitía y ésta prohíbe.
- [ ] **S.2.1b** — Test: una incidencia creada con `priority = 'critical'` nace en `pending`, **no** en `in_progress` (D9). Arrancarla asignada afirmaría que alguien la trabaja cuando no hay operador, y dejaría al recordatorio de F7 sin señal de parada.
- [ ] **S.2.2** — Crear `backend/src/modules/incidents/incident-state-machine.ts` con `TRANSITIONS`, `canTransition(from, to)` y `ALLOWED_STATUSES` **derivado** de `Object.keys(TRANSITIONS)` (D3). Declarar los terminales con arreglo vacío, no omitirlos: un estado ausente del mapa da `undefined` y falla en tiempo de ejecución en vez de rechazar limpio.
- [ ] **S.2.3** — Es lógica pura: se prueba sin montar el servicio ni tocar base de datos.

## S.3 — Servicio de flujo

- [ ] **S.3.1** — Test de regresión del defecto: `getStatuses()` devuelve **cuatro** elementos. **Debe fallar hoy** — es el que impide que `closed` vuelva a quedarse fuera.
- [ ] **S.3.2** — Corregir el tipo de `status` en `incident-workflow.service.ts:31` para incluir `'closed'`, alineándolo con `incident.entity.ts:8`.
- [ ] **S.3.3** — Eliminar el `ALLOWED_STATUSES` local de la línea 46 y consumir el derivado del grafo (D3). Dos listas mantenidas a mano fue la causa raíz.
- [ ] **S.3.4** — Toda transición pasa por `canTransition()`; lo no declarado se rechaza con **409** e indica el motivo.

## S.3b — Permiso `CLOSE incidents`

- [ ] **S.3b.1** — Migración: ampliar el `CHECK` de `permissions.action` para admitir `'CLOSE'`. Hoy sólo acepta `READ|CREATE|UPDATE|DELETE|ASSIGN` (`0009_roles_permissions.sql:25`).
- [ ] **S.3b.2** — Registrar el par `('incidents','CLOSE')` en el catálogo de permisos.
- [ ] **S.3b.3** — Conceder `CLOSE incidents` a `master` y `admin_org` en `roles.permissions`.
- [ ] **S.3b.4** — **Propagar a `users.permissions`** de los usuarios existentes de esos roles. Tocar sólo `roles` los deja sin el permiso — el fallo recurrente de este proyecto.
- [ ] **S.3b.5** — Invalidar `perm:v3:uid:*` tras desplegar.
- [ ] **S.3b.6** — Specs: `admin_org` cierra con motivo; `operador_org` con `UPDATE incidents` pero sin `CLOSE` ⇒ **403**; ese mismo operador **sí** puede resolver.

## S.4 — Motivo de cierre

- [ ] **S.4.1** — Migración: `incidents.closed_reason text NULL`. Reservar numeración en `database/MIGRATION_LOG.md` y añadir la entrada.
- [ ] **S.4.2** — Specs: transición a `closed` sin motivo ⇒ **422**; con motivo ⇒ persiste; transición a `resolved` **no** lo exige.
- [ ] **S.4.3** — Implementar la validación y la persistencia del motivo.
- [ ] **S.4.4** — Exponer `closed_reason` en el DTO de incidencia: debe consultarse desde la incidencia sin recorrer el historial, porque alimenta informes (D4).

## S.5 — Historial atómico

- [ ] **S.5.1** — Cambio de estado y escritura en `status_history` en **la misma transacción**. Un cambio sin registro es peor que no haber cambiado: nadie puede reconstruir qué pasó.
- [ ] **S.5.2** — Test de atomicidad con transacción real (Testcontainers), no con dobles: si falla la escritura del historial, el estado no cambia.
- [ ] **S.5.3** — Test: una transición rechazada **no** escribe nada en el historial — un intento fallido no es un cambio.

## S.6 — Reconciliar el flujo de aprobación

- [ ] **S.6.1** — Ajustar `incident-approval.service.ts` a la semántica única (D5). Si necesita distinguir «resuelta y aprobada» de «resuelta y pendiente de aprobación», eso es un **atributo de aprobación**, no un estado del ciclo de vida — mezclarlos fue el origen del conflicto.
- [ ] **S.6.2** — Los tests existentes del flujo de aprobación deben seguir pasando. Si alguno cambia, **justificarlo por escrito** en el apply-progress: es la señal de que se alteró comportamiento y no sólo semántica.

## S.7 — Cierre

- [ ] **S.7.1** — Documentar la máquina de estados definitiva en el propio `incident-state-machine.ts`, con la definición operativa de cada estado. Es el sitio donde el próximo lector la va a buscar.
- [ ] **S.7.2** — `npm run lint && npm run typecheck && npm test && npm run test:e2e` desde `backend/`.
- [ ] **S.7.3** — Avisar en la story 305 (F3) que el bloqueo se levanta, para que `workflow.util.ts` derive del grafo ya fijado.

---

## Definition of Done

- `incident-state-machine.ts` existe, declara el grafo y `ALLOWED_STATUSES` se deriva de él
- `getStatuses()` devuelve los cuatro estados — test de regresión en verde
- Matriz 4×4 cubierta por specs, incluida `resolved → closed` rechazada
- Cerrar sin resolver exige motivo y lo persiste en `closed_reason`
- Estado e historial se escriben atómicamente, verificado con base de datos real
- `incident-approval.service.ts` reconciliado, con cualquier cambio de test justificado
- Inventario de filas `closed` preexistentes registrado
- Suites de backend en verde
