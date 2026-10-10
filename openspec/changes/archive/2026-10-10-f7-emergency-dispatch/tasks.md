# Tasks: F7 — Despacho de emergencias

**Change**: `2026-08-29-f7-emergency-dispatch`
**Story Shortcut**: 316 — bloqueada por 306 (F4)
**Fuente del contrato**: definición del equipo (2026-08-29);
`incident-workflow.service.ts:84-86,138`, `assignments.service.ts:28-36`,
`mail/mail-outbox.consumer.ts`
**Working dir**: `backend`
**Bloques**: A (carga en la asignación) y B (Telegram) son **independientes** y pueden
ir en paralelo. Sugerido A primero: corrige un defecto que ya afecta a producción.

> **Strict TDD activo**. Test antes que implementación.

---

# BLOQUE A — Validación de carga en la asignación

## A.1 — Migración 0069

- [x] **A.1.1** — Reservar número `0069` en `database/MIGRATION_LOG.md`.
- [x] **A.1.2** — Crear `database/migrations/0069_emergency_dispatch.sql` y su DOWN `database/rollback/0069_emergency_dispatch.DOWN.sql`:
  - `users.telegram_chat_id text NULL`
  - `assignments.cap_override_reason text NULL`
  - `assignments.cap_override_by uuid NULL REFERENCES users(id)`
  - `incidents.reminder_count int NOT NULL DEFAULT 0`
  - `incidents.last_reminded_at timestamptz NULL`
- [x] **A.1.3** — Registrar la entrada en `MIGRATION_LOG.md`.

## A.2 — Unificar la validación (el defecto)

- [x] **A.2.1** — **Test de paridad primero**: el mismo operador saturado produce 429 `CLAIM_LIMIT_REACHED` tanto al autoasignarse (`POST /incidents/:id/claim`) como al ser asignado por un admin (`POST /assignments`). **Debe fallar hoy en el segundo caso** — es la prueba de que el defecto existe.
- [x] **A.2.2** — Extraer a un método compartido la comprobación de carga que hoy vive sólo en `incident-workflow.service.ts:84-86`. Misma regla de negocio aplicada en un solo camino.
- [x] **A.2.3** — Consumirla desde `AssignmentsService.assign()` (`assignments.service.ts:28`), que hoy sólo comprueba que la incidencia no esté ya asignada y **nunca consulta `maxActiveClaimsFor()`**.
- [x] **A.2.4** — Reutilizar el error `CLAIM_LIMIT_REACHED` con 429; no inventar un código paralelo para el mismo hecho.
- [x] **A.2.5** — Verificar que el 409 por incidencia ya asignada sigue funcionando igual.

## A.3 — Excepción al tope

- [x] **A.3.1** — Specs primero: sin motivo ⇒ 422; sobre incidencia **no** `critical` ⇒ 422; con `override_cap` y motivo sobre una `critical` ⇒ 2xx con motivo y autor persistidos; **sin `override_cap` sobre operador saturado ⇒ 429**.
- [x] **A.3.2** — Añadir `override_cap?: boolean` y `override_reason?: string` a `AssignIncidentDto`.
- [x] **A.3.3** — Implementar la excepción **limitada a incidencias `critical`** (D2). Es política, no técnica: si estuviera disponible para el trabajo ordinario, siempre habría una prisa que la justifique y el tope dejaría de existir en la práctica.
- [x] **A.3.4** — Persistir motivo y autor. La excepción **nunca** es el comportamiento por omisión: requiere afirmarla explícitamente en la petición.

## A.4 — `availableOperators()` informa en vez de filtrar

- [x] **A.4.1** — Specs: la respuesta incluye a los saturados con `available: false`; sigue excluyendo a `is_active = false` y a roles que no son `operador_org`/`operador_sistema`.
- [x] **A.4.2** — Quitar `active_count < maxActive` del `WHERE` de la consulta (`incident-workflow.service.ts:145-167`) y calcular la bandera en el `map`.
- [x] **A.4.3** — Añadir `available: boolean` y `maxActive: number` a `AvailableOperatorDto`. `maxActive` permite mostrar «3 de 3» en la interfaz en lugar de un «ocupado» sin contexto.
- [x] **A.4.4** — Documentar en el propio DTO que el nombre del endpoint (`available-operators`) quedó impreciso: ahora devuelve todos. Renombrarlo rompería a un consumidor por una cuestión estética.

## A.5 — Alcance por organización en las escrituras (D12)

- [x] **A.5.1** — **Test primero**: un `admin_org` de la organización A que intenta asignar un operador de B ⇒ **403**. **Debe fallar hoy** — es la prueba del hueco de aislamiento.
- [x] **A.5.2** — Pasar el `scope` del solicitante a `assign()` desde el controlador. Hoy `@Post()` no recibe `@Req()`, mientras que `@Get('incident/:incidentId')` sí lo hace y acota por organización: las lecturas están acotadas y las escrituras no.
- [x] **A.5.3** — Validar en `assign()` que la incidencia pertenece a la organización del solicitante **y** que el operador destino también.
- [x] **A.5.4** — Aplicar la misma validación a `release()` (`@Delete(':id')`) y al `PATCH` de reasignación de T5.6: comparten el hueco.
- [x] **A.5.5** — `master` conserva alcance global — es su definición desde `0015_organizations_scoping.sql` («global scope across every organization»). No convertir la corrección en una restricción para él.
- [x] **A.5.6** — Specs del resto de casos: incidencia de otra organización ⇒ 403; liberar asignación ajena ⇒ 403; reasignar fuera de la organización ⇒ 403.
- [x] **A.5.7** — **No** añadir `OVERRIDE assignments` (Q2 resuelta): `ASSIGN assignments` ya lo tienen sólo `master` y `admin_org` (`0015:65,89`). Un permiso extra sería una segunda cerradura en la misma puerta.

# BLOQUE B — Aviso por Telegram

## B.1 — Esquema DB
- [x] **B.1.1** — Validar que la migración `0069_emergency_dispatch.sql` (creada en A.1) añade `users.telegram_chat_id text NULL` tanto para `admin_org` como para `operador_org`.

## B.2 — Módulo Telegram
- [x] **B.2.1** — Crear `backend/src/modules/telegram/` calcando la estructura de `mail/`: módulo, servicio, consumidor de outbox. Registrar `TELEGRAM_BLOCKING_CLIENT` en `infra/core.module.ts`.
- [x] **B.2.2** — `TelegramService`: cliente de la API con el token desde `TELEGRAM_BOT_TOKEN`. **Nunca en el repositorio.**
- [x] **B.2.3** — `telegram-outbox.consumer.ts` sobre Redis Streams (`telegram:outbox`), siguiendo `mail-outbox.consumer.ts`. Con reintentos; agotados, registra el fallo sin perderlo en silencio.
- [x] **B.2.4** — El consumidor **no** debe registrar el cuerpo completo de la petición: el token viaja en la URL.

## B.3 — Listener de emergencia
- [x] **B.3.1** — Crear `notifications/listeners/critical-incident.listener.ts`: reacciona a la creación de incidencia con `priority = 'critical'`.
- [x] **B.3.2** — Resolver destinatarios: usuarios `admin_org` de la organización de la incidencia que tengan `telegram_chat_id`.
- [x] **B.3.3** — Encolar en el outbox — **nunca llamar a la API desde el listener** (D5). Una llamada síncrona significa que, con Telegram caído, no se puede reportar una emergencia: el canal de aviso impidiendo el aviso.
- [x] **B.3.4** — Mensaje con título, categoría, ubicación, prioridad y **enlace directo al detalle** de la incidencia.
- [x] **B.3.5** — Casos que no deben fallar: admin sin `telegram_chat_id` (se omite, los demás reciben), organización sin admins con Telegram, incidencia sin `organization_id`.

## B.5 — Recordatorio y escalado (D10)
- [x] **B.5.1** — Tarea programada con `@nestjs/schedule` (ya instalado, `^6.1.3` — no hace falta dependencia nueva) que cada minuto busca incidencias `critical` **en `pending`** con más de 25 minutos desde su `created_at`.
- [x] **B.5.2** — Persistir en `incidents` el contador de recordatorios (`reminder_count`) y el instante del último (`last_reminded_at`), para que reiniciar el proceso no reinicie el repique.
- [x] **B.5.3** — **Condición de parada: que la incidencia salga de `pending`.** No «que cambie de estado» en abstracto — `pending` es «nadie la ha tomado». Es la razón operativa por la que las críticas no nacen en `in_progress` (315/D9).
- [x] **B.5.4** — Aviso final al master: tras 1 hora (T+60min desde `created_at`, `reminder_count = 2 → 3`) sin asignar, se envía un único mensaje al `master` indicando que la incidencia crítica no fue asignada en 1 hora. El master hace follow-up manual; no se escala a `operador_sistema` ni a un canal grupal.
- [x] **B.5.5** — Límite duro: a `reminder_count = 3` el scheduler deja de procesar la fila (filtro `reminder_count < cfg.reminderStopAt` en el SELECT). No hay cambio de status — la columna `reminder_count` queda en 3 como evidencia del repique completo. Repicar más entrena a la gente a silenciar el canal, que es el peor resultado para un canal de emergencias.
- [x] **B.5.6** — **Sin horario silencioso** — una emergencia de madrugada se notifica igual. Dejarlo escrito en el código para que no se añada «por sentido común» más adelante.
- [x] **B.5.7** — Specs: repique 1 al admin_org en T=0 (vía `critical-incident.listener`); repique 2 a T+25min al admin_org; repique 3 a T+40min al admin_org; mensaje final al master a T+60min; stop cuando `reminder_count = 3`; parada al pasar a `in_progress`; parada al pasar a `closed`; una `high` en `pending` durante horas **no** genera recordatorios.

## B.6 — Aviso al operador asignado (D11)
- [x] **B.6.1** — Listener `incident-assigned.listener.ts` sobre `incident.assigned` que encola un mensaje formateado para el operador **asignado** con: título, descripción completa, categoría, prioridad, ubicación geográfica (coordenadas y enlace a Google Maps), y enlace directo al detalle en la plataforma.
- [x] **B.6.2** — **Sólo al asignado**, nunca a todos los operadores: notificar a todos reintroduciría el modelo de grupo ya rechazado, con sus dos agujeros — varios acudiendo a la misma emergencia y ninguna con dueño identificable.
- [x] **B.6.3** — Operador sin `telegram_chat_id` ⇒ la asignación se crea igual y el aviso se omite.
- [x] **B.6.4** — Reasignación ⇒ el nuevo asignado recibe el mensaje con la tarea actualizada.
- [x] **B.6.5** — Si la asignación usó la excepción al tope (A.3), el mensaje **incluye el motivo** que escribió el admin (`override_reason`, D9). El admin redacta sabiendo que lo lee la persona a la que le carga el trabajo extra.

## B.4 — Tests del bloque B

- [x] **B.4.1** — Prioridad no `critical` ⇒ ningún aviso.
- [x] **B.4.2** — **Telegram caído ⇒ la incidencia se crea igual.** Es la prueba de R1 y la más importante del bloque.
- [x] **B.4.3** — El camino de creación de incidencia no contiene llamadas síncronas a servicios externos.
- [x] **B.4.4** — El token no aparece en los registros.

## C — Cierre

- [x] **C.1** — `npm run lint && npm run typecheck && npm test && npm run test:e2e` desde `backend/`.
- [x] **C.2** — Documentar `TELEGRAM_BOT_TOKEN` en `backend/.env.example`.
- [x] **C.3** — Avisar en la story 305 (F3) que el contrato de `AvailableOperatorDto` cambió, para que la tarea F3.4.10 consuma la bandera `available`.

---

## Definition of Done

**Bloque A**
- El camino de asignación del admin valida el tope igual que el de autoasignación — test de paridad en verde
- Asignar, liberar y reasignar acotados por organización; `master` conserva alcance global
- La excepción exige `override_cap` **y** motivo, se limita a `critical`, y registra autor
- `availableOperators()` devuelve a todos con `available` y `maxActive`
- Sin `override_cap`, un operador saturado se rechaza con 429

**Bloque B**
- Una incidencia `critical` avisa por Telegram a los `admin_org` con chat configurado
- Telegram caído no impide crear la incidencia — verificado por test
- Ningún destinatario ausente provoca un fallo
- El token vive en el entorno y no aparece en registros ni en el repositorio
