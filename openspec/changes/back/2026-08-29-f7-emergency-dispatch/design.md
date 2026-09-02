# Design: F7 — Despacho de emergencias

## Technical Approach

Dos bloques independientes, desarrollables en paralelo:

**A — Validación de carga en la asignación.** Corrige un defecto que existe hoy y
afecta a toda asignación, no sólo a las emergencias. Aporta valor aunque Telegram nunca
se implemente.

**B — Aviso por Telegram.** Integración externa nueva, calcada del patrón de `mail`.

El orden sugerido es A primero: es el que hace que el paso 4 del flujo funcione, y el
aviso sin asignación fiable no sirve de mucho.

## Architecture Decisions — Bloque A

**D1 — Unificar la validación de carga en los dos caminos.**
Hoy sólo el camino de autoasignación valida:

```ts
// incident-workflow.service.ts:84-86  — camino claim, SÍ valida
if (active >= maxActive) {
  throw new HttpException(CLAIM_LIMIT_REACHED, HttpStatus.TOO_MANY_REQUESTS);
}

// assignments.service.ts:28-36  — camino admin, NO valida
const existing = await this.assignmentRepo.findOne({ where: { incidentId, deletedAt: IsNull() } });
if (existing) throw new ConflictException(...);
// …guarda sin consultar maxActiveClaimsFor ni la carga del operador
```

La regla de negocio es la misma —un operador no debe llevar más de N incidencias
activas— y estaba aplicada en un solo camino. Se extrae a un método compartido y ambos
lo consumen. Reutilizar `CLAIM_LIMIT_REACHED` en vez de inventar un error paralelo:
mismo hecho, mismo código.

**D2 — La excepción al tope se limita a incidencias `critical`.**
Decisión del equipo: permitir asignar por encima del tope con confirmación explícita.
Se acota a emergencias.

Razón: si la excepción está disponible para el trabajo ordinario, el tope deja de
existir en la práctica —siempre habrá prisa que la justifique— y la organización pierde
el único mecanismo que protege a sus operadores de la sobrecarga. Limitarla a
`critical` mantiene el tope real para el 95 % de los casos y abre la puerta justo donde
el equipo la necesita.

Es una decisión de política, no técnica: cambiarla es una condición.

**D3 — La excepción exige motivo y registra autor.**

```ts
// assignments/dto/assign-incident.dto.ts
export class AssignIncidentDto {
  incident_id!: string;
  operator_id!: string;
  role?: string;
  override_cap?: boolean;      // NUEVO — confirmación explícita
  override_reason?: string;    // NUEVO — obligatorio si override_cap
}
```

Persistido en `assignments.cap_override_reason` y `assignments.cap_override_by`.
**No existe tabla de auditoría en el proyecto** (verificado), así que el registro vive
en la propia fila. Es suficiente: la excepción pertenece a esa asignación concreta.

`override_cap` ausente o falso sobre un operador saturado ⇒ 429. La excepción nunca es
el comportamiento por omisión; requiere afirmarla.

**D4 — `availableOperators()` informa en lugar de filtrar.**
Hoy la consulta excluye a los saturados (`active_count < maxActive` en el `WHERE`), de
modo que ni aparecen. Consecuencia práctica: el admin abre el desplegable, ve tres
operadores donde la organización tiene ocho, y no tiene forma de saber por qué.

Pasa a devolverlos todos, con la bandera:

```ts
export class AvailableOperatorDto {
  id!: string;
  name!: string;
  email!: string | null;
  activeClaimCount!: number;
  available!: boolean;   // NUEVO — activeClaimCount < tope de la organización
  maxActive!: number;    // NUEVO — el tope, para poder mostrar «3 de 3»
}
```

El nombre del endpoint (`available-operators`) queda algo impreciso, pero renombrarlo
rompería a un consumidor por una cuestión estética. Se documenta en el propio DTO.

## Architecture Decisions — Bloque B

**D5 — Telegram por outbox, calcando el patrón de `mail`.**
`backend/src/modules/mail/mail-outbox.consumer.ts` ya resuelve exactamente este
problema: escribir la intención de envío en Redis Streams y consumirla aparte.

Se replica en vez de llamar a la API de Telegram desde el listener. La razón está en el
riesgo R1: una llamada síncrona en el camino de creación significa que, si Telegram
está caído, **no se puede reportar una emergencia**. El canal de aviso impidiendo el
aviso es el peor fallo que este diseño podría tener.

**D6 — El destinatario es `users.telegram_chat_id`, no la organización.**
El aviso va al usuario `admin_org`, y una organización puede tener varios: el seed crea
`admin-org-1@tase.local` y `admin-org-2@tase.local`. Una columna en `organizations`
obligaría a elegir uno o a inventar un grupo, que es justo el diseño descartado.

Nullable: no todo admin configurará Telegram, y la ausencia se omite sin fallar.

**D7 — Bot de una vía.**
Notifica y enlaza al detalle; no se asigna desde Telegram. La alternativa exige
webhook, gestión de callbacks y mapear cuenta de Telegram ↔ usuario del sistema — tres
superficies nuevas, incluida una expuesta a internet. El admin ya entra a la aplicación
a asignar, así que el bot sólo tiene que traerlo hasta ahí.

**D8 — El secreto por variable de entorno, ausente de los registros.**
`TELEGRAM_BOT_TOKEN` en el entorno, nunca en el repositorio. El consumidor no debe
registrar el cuerpo completo de la petición, que lo incluye en la URL.

## Data Flow

**Aviso:**
```
crear incidencia (priority = 'critical')
  → listener incident.created
  → resolver admin_org de la organización con telegram_chat_id
  → XADD al stream de Telegram (outbox)          ← acaba el camino de creación
  ────────────────────────────────────────────────
  → consumidor lee el stream
  → POST a la API de Telegram
  → éxito: confirma · fallo: reintenta, y tras agotar reintentos registra
```

**Asignación:**
```
admin abre el detalle → GET :id/available-operators → lista completa con `available`
  → elige operador
     ├─ available → POST /assignments → 2xx → «Operador libre y asignado correctamente»
     └─ !available
          ├─ sin override_cap → 429 → «Operador ocupado, no se le pueden asignar más incidencias»
          └─ con override_cap + motivo
               ├─ incidencia critical → 2xx, registra motivo y autor
               └─ no critical         → 422
```

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `database/migrations/00XX_emergency_dispatch.sql` | Nuevo | `users.telegram_chat_id`, `assignments.cap_override_reason`, `assignments.cap_override_by` |
| `database/MIGRATION_LOG.md` | Modificar | Entrada nueva |
| `backend/src/modules/assignments/assignments.service.ts` | Modificar (D1/D2/D3) | Valida tope; admite excepción registrada |
| `backend/src/modules/assignments/dto/assign-incident.dto.ts` | Modificar (D3) | `override_cap`, `override_reason` |
| `backend/src/modules/incidents/incident-workflow.service.ts` | Modificar (D1/D4) | Extrae la validación de tope; `availableOperators()` deja de filtrar |
| `backend/src/modules/incidents/dto/available-operator.dto.ts` | Modificar (D4) | `available`, `maxActive` |
| `backend/src/modules/telegram/telegram.module.ts` | Nuevo (D5) | Módulo, calcado de `mail` |
| `backend/src/modules/telegram/telegram.service.ts` | Nuevo (D5) | Cliente de la API |
| `backend/src/modules/telegram/telegram-outbox.consumer.ts` | Nuevo (D5) | Consumidor con reintentos |
| `backend/src/modules/notifications/listeners/critical-incident.listener.ts` | Nuevo | Escucha `critical`, resuelve destinatarios, encola |

## Redis Caching Strategy

No se introduce caché. Redis se usa aquí como **stream**, igual que en `mail`, no como
almacén de conveniencia. La lista de operadores no se cachea: su carga cambia con cada
asignación y un dato obsoleto en esta pantalla induce a asignar a alguien saturado.

## Testing Strategy

`strict_tdd: true` — test antes que implementación.

**Bloque A:**
- Paridad entre caminos: el mismo operador saturado produce 429 tanto al autoasignarse
  como al ser asignado por un admin. **Este test falla hoy** en el segundo caso y es la
  prueba de que el defecto existía.
- Excepción: sin motivo ⇒ 422; sobre incidencia no crítica ⇒ 422; con ambos ⇒ 2xx y
  quedan persistidos motivo y autor.
- Sin `override_cap` sobre operador saturado ⇒ 429: la excepción no es el
  comportamiento por omisión.
- `availableOperators()` devuelve saturados con `available: false`, y sigue excluyendo
  a inactivos y a roles ajenos.

**Bloque B:**
- Prioridad no crítica ⇒ ningún aviso.
- Admin sin `telegram_chat_id` ⇒ se omite, los demás reciben.
- Organización sin admins con Telegram, e incidencia sin `organization_id` ⇒ la
  creación no falla.
- **Telegram caído ⇒ la incidencia se crea igual.** Es la prueba de R1 y la más
  importante del bloque.
- El camino de creación no contiene llamadas síncronas a servicios externos.
- El token no aparece en los registros.

Comandos: `npm run lint && npm run typecheck && npm test && npm run test:e2e` desde
`backend/`.

**D9 — La excepción al tope avisa al operador afectado (Q1 resuelta).**
Cuando un admin asigna por encima del tope, el operador recibe una cuarta incidencia
sin haber sido consultado. El aviso va a él, con el motivo que el admin escribió.

Se descartan las alternativas: no avisar a nadie deja la excepción en una columna que
nadie mira; avisar a `master`/`operador_sistema` convierte una decisión operativa
normal en un incidente de plataforma.

Avisar al afectado tiene además un efecto útil sobre quien decide: el admin redacta el
motivo sabiendo que lo va a leer la persona a la que le está cargando el trabajo extra.

**D10 — Recordatorio cada 5 minutos mientras la crítica siga en `pending` (Q3 resuelta).**
`@nestjs/schedule@6.1.3` ya está instalado; no hace falta infraestructura nueva.

**Condición de parada: que la incidencia salga de `pending`.** No «que cambie de
estado» en abstracto — `pending` es exactamente «nadie la ha tomado todavía», y en
cuanto se asigna, el recordatorio pierde sentido. Ésta es la razón operativa por la que
las críticas **no** pueden nacer en `in_progress` (ver 315/D9): sin `pending` no hay
señal de parada.

Tres decisiones que el «cada 5 minutos» por sí solo no resuelve:

1. **Escalado, no repique infinito.** Tras 6 recordatorios (30 minutos) sin asignación,
   se avisa también a `master` y `operador_sistema`. Una emergencia que lleva media
   hora sin que nadie la tome dejó de ser un problema de la organización.
2. **Límite duro.** A los 12 recordatorios (1 hora) se detiene el repique y se marca la
   incidencia como no atendida. Repicar indefinidamente entrena a la gente a silenciar
   el canal, que es el peor resultado posible para un canal de emergencias.
3. **Sin horario silencioso.** Una emergencia a las 3 de la mañana sigue siendo una
   emergencia. Se documenta explícitamente para que no se añada «por sentido común» más
   adelante.

**D11 — El operador notificado es el asignado, no todos (Q3, segunda parte).**
Al asignarse la incidencia, el `operador_org` **asignado** recibe un mensaje con el
detalle y el enlace. Es lo que responde a «para que sepan lo que deben hacer»: su tarea
concreta, no una alerta ambiental.

Se descarta notificar a todos los operadores: reintroduciría el modelo de grupo ya
rechazado, con sus dos agujeros —varios acudiendo a la misma emergencia, y ninguna con
dueño identificable—. El admin decide; el asignado se entera.

Implica que `telegram_chat_id` también aplica a `operador_org`, no sólo a `admin_org`.
La columna en `users` ya lo cubre (D6): no hace falta esquema adicional.

**D12 — Las escrituras de asignación deben acotarse por organización (Q2 resuelta, y un defecto encontrado al resolverla).**

Regla del equipo: sólo `admin_org` asigna incidencias, y sólo a `operador_org` **de su
misma organización**.

*Primera mitad: ya se cumple.* `ASSIGN assignments` lo tienen únicamente `master` y
`admin_org` (verificado en `0015_organizations_scoping.sql:65,89`); ni
`operador_sistema` ni `operador_org` lo poseen. **Por eso la excepción al tope no
necesita un permiso propio**: quien puede asignar ya es exactamente quien debe poder
hacerlo. Se descarta `OVERRIDE assignments` — sería una segunda cerradura en la misma
puerta.

*Segunda mitad: no se cumple.* El alcance por organización se aplica en las lecturas y
no en las escrituras:

```ts
// assignments.controller.ts
@Get('incident/:incidentId')
list(@Param(…) incidentId, @Req() req) {
  return this.assignmentsService.list(incidentId, req.user!.scope);   // ← acotado
}

@Post()
assign(@Body() dto: AssignIncidentDto) {
  return this.assignmentsService.assign(dto.incident_id, dto.operator_id, dto.role);
}                                        // ↑ sin scope; el servicio tampoco lo consulta
```

`AssignmentsService.assign()` no comprueba ni que el operador pertenezca a la
organización de la incidencia, ni que quien asigna pertenezca a ella. `release()` y el
`PATCH` de reasignación (T5.6) comparten el hueco.

Consecuencia: un `admin_org` de la organización A puede asignar un operador de la
organización B, y liberar asignaciones ajenas. Requiere una cuenta válida, así que no
es una puerta abierta, pero sí una fuga de aislamiento entre organizaciones — y el
proyecto es explícitamente multiorganización desde la migración 0015.

Corrección: las tres escrituras reciben el `scope` del solicitante y validan
- que la incidencia pertenezca a la organización del solicitante,
- y que el operador destino también.

`master` conserva alcance global, que es su definición desde 0015 («global scope across
every organization»).

## Open Questions

Ninguna. Q1, Q2 y Q3 quedaron resueltas en D9, D10, D11 y D12.
