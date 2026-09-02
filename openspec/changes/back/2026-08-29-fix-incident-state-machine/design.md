# Design: Corrección de la máquina de estados de incidencias

## Technical Approach

El problema de fondo no es que falte un `if`: es que **no existe una máquina de estados
declarada**. Hay un arreglo de estados permitidos (`ALLOWED_STATUSES`) que actúa como
lista de valores válidos, no como grafo de transiciones, y las reglas de qué puede
seguir a qué viven dispersas entre servicios.

Por eso `closed` pudo quedar en la base de datos y en el tipo pero fuera del servicio
sin que nada lo detectara, y por eso dos semánticas contradictorias pudieron convivir
durante varias fases.

La corrección es declarar el grafo en un solo sitio y derivar todo de ahí.

## Architecture Decisions

**D1 — Semántica ramificada: `resolved` y `closed` son terminales alternativos.**

```
                  ┌──────────► resolved   (el operador resolvió)
pending ──► in_progress
                  └──────────► closed     (no pudo resolverse, se dio de baja)
```

Se descarta la lectura lineal del comentario de 0020
(`pending → in_progress → resolved → closed`). Razón: convierte `closed` en un estado
de archivado, y entonces **no queda ningún estado para el fracaso**. Una incidencia que
no se pudo atender terminaría marcada como `resolved` para poder cerrarse, lo que
falsea toda métrica de resolución. La distinción entre «lo arreglamos» y «no pudimos»
es justamente la que un sistema de gestión de incidencias no puede perder.

**D2 — Tabla de transiciones explícita, no condicionales dispersos.**

```ts
// backend/src/modules/incidents/incident-state-machine.ts
export const TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  pending:     ['in_progress', 'closed'],   // closed: reporte inválido o duplicado (D7)
  in_progress: ['resolved', 'closed'],
  resolved:    [],
  closed:      [],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
```

Tres propiedades que importan: la regla se lee de un vistazo, se prueba como función
pura sin montar el servicio, y `workflow.util.ts` de F3 puede derivar las acciones
disponibles sin replicarla. Duplicar el grafo en el frontend es cómo se desincronizan.

Los terminales se declaran con arreglo vacío en lugar de omitirse: un estado ausente
del mapa provoca `TRANSITIONS[from]` indefinido y un fallo en tiempo de ejecución en
vez de un rechazo limpio.

**D3 — `ALLOWED_STATUSES` se deriva del grafo, no se mantiene aparte.**

```ts
export const ALLOWED_STATUSES = Object.keys(TRANSITIONS) as IncidentStatus[];
```

Es la causa raíz del defecto 1: dos listas de estados mantenidas a mano acabaron
divergiendo. Con esto, añadir un estado al grafo lo hace visible en `getStatuses()`
automáticamente y no puede volver a quedarse a medio camino.

**D4 — Motivo obligatorio al cerrar sin resolver.**
Nueva columna `incidents.closed_reason text NULL`. Obligatoria en la transición a
`closed`, ausente en la transición a `resolved`.

Un cierre por imposibilidad sin explicación es un registro inútil: nadie puede después
saber si fue por falta de recursos, por competencia de otra entidad o por un reporte
inválido. Y esa información es precisamente la que justifica el estado.

Se descarta reutilizar el campo de notas del historial: el motivo debe ser consultable
desde la incidencia sin recorrer su historial, porque alimenta informes.

**D5 — Reconciliar `incident-approval.service.ts` como parte del alcance.**
Ese servicio se construyó sobre la lectura lineal. No se toca «de paso» ni se deja para
después: se revisa dentro de este change, porque una vez cambiada la semántica su
comportamiento queda apoyado en una premisa que ya no es cierta.

Si su flujo de aprobación necesita distinguir «resuelta y aprobada» de «resuelta y
pendiente de aprobación», eso es un atributo aparte —una marca de aprobación— y no un
estado del ciclo de vida. Mezclarlos fue el origen del conflicto.

**D6 — Inventariar antes de migrar datos.**
Un `closed` ya escrito no dice bajo qué lectura se escribió. Primero se cuenta cuántas
filas hay; si son cero —lo probable, dado que el servicio nunca pudo escribir ese
estado—, no hay migración. Si las hay, se decide caso por caso o se marcan como
indeterminadas. Reinterpretarlas en masa inventaría información.

## Data Flow

```
PATCH estado → canTransition(actual, destino)
  ├─ false → 409 con el motivo (transición no declarada)
  └─ true
      ├─ destino = 'closed' y sin motivo → 422
      └─ transacción:
            UPDATE incidents SET status, closed_reason?
            INSERT status_history (from, to, autor, instante)
            emitir evento
```

Historial y cambio de estado van en la misma transacción: un cambio sin registro es
peor que no haber cambiado, porque nadie puede reconstruir qué pasó.

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/src/modules/incidents/incident-state-machine.ts` | Nuevo (D2/D3) | `TRANSITIONS`, `canTransition()`, `ALLOWED_STATUSES` derivado |
| `backend/src/modules/incidents/incident-workflow.service.ts` | Modificar (D1/D2) | Tipa `status` con los cuatro (línea 31); consume el grafo; elimina el `ALLOWED_STATUSES` local (línea 46) |
| `backend/src/modules/notifications/incident-approval.service.ts` | Revisar (D5) | Reconciliar con la semántica única |
| `database/migrations/00XX_incident_closed_reason.sql` | Nuevo (D4) | `incidents.closed_reason text NULL` |
| `database/migrations/00XX_incident_closed_backfill.sql` | Condicional (D6) | Sólo si el inventario encuentra filas |
| `database/MIGRATION_LOG.md` | Modificar | Entradas nuevas |

## Redis Caching Strategy

No aplica. Los estados no se cachean; se leen de la fila de la incidencia.

## Testing Strategy

`strict_tdd: true` — test antes que implementación.

- **`incident-state-machine.ts`**: es el núcleo y se prueba como función pura. Matriz
  completa de 4×4: las cuatro transiciones válidas y las doce inválidas. Incluye
  explícitamente `resolved → closed`, que es la que la semántica anterior permitía y
  ésta prohíbe.
- **Regresión del defecto 1**: `getStatuses()` devuelve cuatro elementos. Este test
  falla hoy y es el que impide que `closed` vuelva a quedarse fuera.
- **Motivo de cierre**: transición a `closed` sin motivo ⇒ 422; con motivo ⇒ persiste y
  aparece en el historial; transición a `resolved` no lo exige.
- **Atomicidad**: si la escritura del historial falla, el estado no cambia. Se prueba
  con transacción real, no con dobles.
- **Flujo de aprobación (D5)**: los tests de `incident-approval.service.ts` siguen
  pasando; cualquier cambio en ellos se justifica por escrito en el apply-progress.
- **Inventario (D6)**: consulta de conteo de filas `closed` antes de decidir la migración.
- Comandos: `npm run lint && npm run typecheck && npm test && npm run test:e2e` desde `backend/`.

**D7 — `pending → closed` permitido, y sólo para quien puede cerrar (Q1 resuelta).**
Un reporte inválido o duplicado no necesita operador asignado para descartarse; exigir
`in_progress` obligaría a simular trabajo sobre basura. El riesgo de abrir esta arista
—cerrar reportes sin mirarlos— queda contenido por D8: cerrar es privilegio de
`admin_org`, no de cualquiera con acceso a la incidencia.

**D8 — Cerrar exige un permiso propio: `CLOSE incidents` (Q2 resuelta).**
Decisión del equipo: sólo `admin_org` (y `master`) pueden dar de baja una incidencia.
Hoy resolver y cerrar comparten `UPDATE incidents`, así que cualquier `operador_org`
podría descartar el reporte de un ciudadano.

Requiere ampliar el catálogo de acciones, que hoy no contempla `CLOSE`:

```sql
-- 0009_roles_permissions.sql:25 — CHECK actual
action varchar(20) NOT NULL CHECK (action IN ('READ','CREATE','UPDATE','DELETE','ASSIGN'))
```

La migración altera ese `CHECK` para admitir `CLOSE`, registra el par
`('incidents','CLOSE')` y concede `CLOSE incidents` a `master` y `admin_org`.

⚠️ Como en toda concesión de permisos en este proyecto: actualizar `roles.permissions`
**y** `users.permissions` de los usuarios existentes, e invalidar `perm:v3:uid:*`.
Tocar sólo `roles` deja a los usuarios actuales sin el permiso.

**D9 — `critical` NO salta a `in_progress`: nace en `pending` como todas.**
Se evaluó arrancar las incidencias críticas directamente en `in_progress`. Se descarta
por dos razones concretas:

1. **Contradice la definición del estado.** `in_progress` significa «asignada, con
   seguimiento al `operador_org` responsable». Una crítica recién creada no tiene
   operador: el flujo de F7 avisa al `admin_org` justamente para que lo asigne.
   Arrancarla en `in_progress` afirmaría que alguien la está trabajando cuando no hay
   nadie, y haría indistinguible «emergencia esperando asignación» de «emergencia en
   curso».
2. **Rompería el recordatorio de F7.** El repique cada 5 minutos se detiene cuando la
   incidencia cambia de estado. Si `critical` naciera en `in_progress`, no quedaría
   ninguna transición que apagara los avisos.

`pending` es precisamente la señal de «nadie la ha tomado todavía», que es la condición
que el despacho de emergencias necesita vigilar. La urgencia de una crítica se expresa
en su prioridad y en el aviso inmediato, no en saltarse un estado.

## Open Questions

Ninguna. Q1 y Q2 quedaron resueltas en D7, D8 y D9.
