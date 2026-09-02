# Proposal: F7 — Despacho de emergencias

## Intent

Una incidencia con `priority = 'critical'` es una emergencia. Hoy se crea igual que
cualquier otra y **nadie se entera** hasta que alguien mira el listado.

Flujo objetivo (definido por el equipo, 2026-08-29):

1. Se crea una incidencia `critical`
2. El **`admin_org`** de la organización recibe un aviso por Telegram
3. El admin entra a la aplicación y **asigna un `operador_org`**
4. La aplicación le informa el resultado: operador libre y asignado, u operador ocupado

Se descartó un diseño previo que publicaba en un grupo de Telegram con todos los
operadores para que acudiera cualquiera. Decidir quién atiende es responsabilidad
explícita del admin: el modelo de grupo dejaba dos agujeros —dos operadores acudiendo
a la misma emergencia, y ninguna emergencia con dueño identificable.

## Hallazgo que cambia el alcance

Al verificar el paso 4 apareció un defecto: **el camino de asignación del admin no
valida el tope de carga del operador.**

| Camino | Valida el tope | Dónde |
|---|---|---|
| `POST /incidents/:id/claim` — el operador se autoasigna | **Sí** — 429 `CLAIM_LIMIT_REACHED` | `incident-workflow.service.ts:84-86` |
| `POST /assignments` — el admin asigna | **No** | `assignments.service.ts:28-36` |

`AssignmentsService.assign()` sólo comprueba que la incidencia no esté ya asignada.
Nunca consulta `maxActiveClaimsFor()` ni la carga del operador. Es decir: hoy un admin
**ya puede** saturar a un operador, en silencio y sin registro.

Así que el mensaje «operador ocupado» no es renderizar un 429 existente — hay que
añadir la validación a ese camino primero.

## Scope

### In Scope — Aislamiento entre organizaciones (defecto encontrado)
- Acotar por organización `assign()`, `release()` y el `PATCH` de reasignación
- Hoy las **lecturas** de asignaciones se acotan por `req.user.scope` y las
  **escrituras** no: un `admin_org` de una organización puede asignar operadores de otra
  y liberar asignaciones ajenas. El proyecto es multiorganización desde la migración 0015

### In Scope — Validación de carga en la asignación
- Validar el tope de la organización en `AssignmentsService.assign()`
- Rechazar con 429 `CLAIM_LIMIT_REACHED`, reutilizando el error del camino `claim`
- **Excepción explícita**: permitir asignar por encima del tope con confirmación, con
  motivo obligatorio y registro de quién lo autorizó
- Ampliar `availableOperators()` para devolver **todos** los operadores con una bandera
  de disponibilidad, no sólo los que están por debajo del tope

### In Scope — Aviso por Telegram
- `users.telegram_chat_id` para los `admin_org`
- Listener sobre creación de incidencia con `priority = 'critical'`
- `TelegramService` con outbox y consumidor, siguiendo el patrón del módulo `mail`
- Mensaje con título, categoría, ubicación, prioridad y enlace directo al detalle

### Out of Scope
- Bot de dos vías: no se reclama ni se asigna desde Telegram. Exigiría webhook,
  callbacks y mapear cuenta de Telegram ↔ usuario, y el admin ya entra a la aplicación
- Notificar a **todos** los operadores por Telegram: sólo se avisa al asignado
- Escalado automático a otra organización si nadie está libre

## Capabilities

### New Capabilities
- `emergency-dispatch`: aviso por Telegram ante incidencias `critical` y asignación
  asistida con control de carga

### Modified Capabilities
- `incident-workflow`: `availableOperators()` deja de filtrar y pasa a informar
- `admin-panel-backend`: la asignación valida carga y admite excepción registrada

## DB Schema Changes

- `users.telegram_chat_id text NULL` — el destinatario es el usuario `admin_org`, no la
  organización: una organización puede tener varios (el seed crea dos)
- `assignments.cap_override_reason text NULL` — motivo cuando se asigna por encima del tope
- `assignments.cap_override_by uuid NULL` REFERENCES `users(id)` — quién lo autorizó

No hay tabla de auditoría en el proyecto (verificado), así que el registro de la
excepción vive en la propia fila de asignación.

## Permission Requirements (RBAC)

- Asignar: `ASSIGN assignments` (ya existe)
- **Asignar por encima del tope**: `ASSIGN assignments` más confirmación explícita en la
  petición. **No se añade un permiso propio** (Q2 resuelta): `ASSIGN assignments` ya lo
  tienen únicamente `master` y `admin_org` (`0015_organizations_scoping.sql:65,89`), que
  es exactamente quien debe poder asignar. Un permiso extra sería una segunda cerradura
  en la misma puerta.
- **Lo que falta no es un permiso, es el alcance**: la regla «sólo a operadores de su
  misma organización» no se valida en ninguna escritura (ver arriba).

Los permisos nuevos, si los hubiera, deben propagarse a `roles.permissions` **y**
`users.permissions`, e invalidar `perm:v3:uid:*`.

## Domain Module Dependencies

- `backend/src/modules/incidents` — `availableOperators()`, `maxActiveClaimsFor()`
- `backend/src/modules/assignments` — `assign()` es el punto a corregir
- `backend/src/modules/notifications` — patrón de listeners
- `backend/src/modules/mail` — patrón outbox + consumidor a replicar

## Approach

Dos bloques independientes que se pueden desarrollar en paralelo. El de validación de
carga es el que aporta valor incluso sin Telegram: corrige un defecto que existe hoy y
afecta a toda asignación, no sólo a las emergencias.

Telegram se construye calcando el patrón de `mail` —outbox en Redis Streams más
consumidor— en vez de llamar a la API desde el listener. Un fallo del canal externo no
puede propagarse a la creación de la incidencia.

## Dependencies

- **Depende de**: F4 (story 306) — el asistente expone `critical`, que es lo que hace
  que existan emergencias creadas por ciudadanos
- **Bloquea**: nada

## Risks

- **R1 — Telegram caído bloquea el reporte de emergencia.** Sería el peor fallo posible:
  el canal de aviso impidiendo el aviso. Mitigación: outbox, nunca llamada síncrona en
  el camino de creación.
- **R2 — La excepción al tope se vuelve rutina.** Si asignar por encima del tope es tan
  fácil como asignar normal, el tope deja de existir. Mitigación: motivo obligatorio,
  autor registrado, y la excepción limitada a incidencias `critical` (ver diseño).
- **R3 — Fuga del secreto del bot.** Variable de entorno, nunca en el repositorio, y
  ausente de logs.
- **R4 — El aislamiento entre organizaciones lleva tiempo roto en las escrituras.**
  Conviene revisar si hay asignaciones cruzadas ya creadas antes de añadir la
  validación: la corrección no las deshace, sólo impide crear más.
