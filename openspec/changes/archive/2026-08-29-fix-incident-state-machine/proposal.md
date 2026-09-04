# Proposal: Corrección de la máquina de estados de incidencias

## Intent

Dos defectos que conviven en el mismo dominio y se contradicen entre sí.

**Defecto 1 — `closed` es inalcanzable desde el flujo de operador.**

| Fuente | Estados admitidos |
|---|---|
| `database/migrations/0020_add_closed_status_to_incidents.sql` | `pending`, `in_progress`, `resolved`, `closed` |
| `backend/src/entities/incident.entity.ts:8` | los cuatro |
| **`backend/src/modules/incidents/incident-workflow.service.ts:31`** | tipa `status` con **tres** |
| **`incident-workflow.service.ts:46`** | `ALLOWED_STATUSES = ['pending','in_progress','resolved']` |

La columna acepta `closed`, el tipo lo declara, y el servicio que gobierna las
transiciones lo excluye. `getStatuses()` —que alimenta al frontend— devuelve
`[...ALLOWED_STATUSES]`, así que el cuarto estado tampoco llega a la interfaz.

**Defecto 2 — dos semánticas incompatibles para el mismo valor.**

El comentario de la migración 0020 documenta un flujo **lineal**:

```
-- T5.6: extend IncidentStatus with 'closed' (admin approve flow)
-- (pending -> in_progress -> resolved -> closed)
```

Ahí `closed` es *archivado tras aprobación*, posterior a `resolved`.
`incident-approval.service.ts` (módulo notifications) está construido sobre esa lectura.

La definición operativa del equipo (2026-08-29) es **ramificada**:

| Estado | Significado |
|---|---|
| `pending` | Publicada, aún **sin asignar** a un operador |
| `in_progress` | Asignada; seguimiento al `operador_org` responsable |
| `resolved` | El operador **resolvió** la incidencia |
| `closed` | **No pudo resolverse**; se dio de baja |

`resolved` y `closed` son terminales **alternativos**: uno es éxito, el otro es cierre
honesto de un fracaso. No es lo mismo que archivar algo ya resuelto.

Mientras las dos lecturas convivan, cualquier consumidor —la UI de F3, los informes,
las métricas— construye sobre una ambigüedad. Un `closed` en la base de datos hoy no
significa nada preciso.

## Scope

### In Scope
- Fijar y documentar **una** máquina de estados
- Incluir `closed` en el tipo y en `ALLOWED_STATUSES` de `incident-workflow.service.ts`
- Declarar las transiciones válidas de forma explícita y rechazar el resto con 409
- Reconciliar con el flujo de aprobación de T5.6 (`incident-approval.service.ts`)
- Exigir motivo al cerrar sin resolver: un cierre por imposibilidad sin explicación no
  es auditable
- Migración de datos si el `closed` existente en producción responde a la otra semántica

### Out of Scope
- UI de las transiciones → F3 (bloqueada por este change)
- Cambiar el conjunto de estados: son cuatro, ni más ni menos
- Renombrar `closed` en base de datos

## Capabilities

### Modified Capabilities
- `incident-workflow`: la máquina de estados pasa a estar declarada y completa;
  `closed` deja de ser inalcanzable
- `admin-panel-backend`: el flujo de aprobación de T5.6 se reinterpreta según la
  semántica única

## DB Schema Changes

Probablemente ninguna estructural — el `CHECK` de 0020 ya admite los cuatro valores.

Sí puede hacer falta una **migración de datos** si existen filas con `closed` escritas
bajo la semántica lineal (archivado post-resolución): bajo la semántica nueva
significarían lo contrario de lo que se quiso registrar. Verificar antes de aplicar;
si el conjunto está vacío, no hay nada que migrar.

Se evalúa añadir a `incidents` una columna `closed_reason text NULL` para el motivo
del cierre sin resolución (ver diseño).

## Permission Requirements (RBAC)

Sin permisos nuevos. `UPDATE incidents` sigue gobernando las transiciones. Se evalúa
si cerrar sin resolver debe exigir un permiso superior al de resolver — ver Q2.

## Domain Module Dependencies

- `backend/src/modules/incidents` — `incident-workflow.service.ts` es el núcleo
- `backend/src/modules/notifications` — `incident-approval.service.ts` depende de la
  lectura lineal actual
- `backend/src/modules/status-history` — registra las transiciones
- Consumidor bloqueado: F3 (`workflow.util.ts` → `availableActions()`)

## Approach

Primero decidir la semántica, después implementarla. El orden importa: escribir código
antes de resolver el conflicto sólo consolidaría una de las dos lecturas por accidente.

La máquina se declara como una **tabla de transiciones explícita**, no como
condicionales dispersos. Es la forma de que la regla sea legible, testeable sin montar
el servicio, y de que el frontend pueda derivar acciones sin duplicarla.

## Dependencies

- **Depende de**: nada
- **Bloquea**: F3 (story 305) — tarea F3.1.7, decisión F3/D10

## Risks

- **R1 — `incident-approval.service.ts` se apoya en la lectura lineal.** Cambiar la
  semántica sin revisarlo deja el flujo de aprobación operando sobre una premisa falsa.
  Mitigación: se revisa como parte del alcance, no como efecto colateral.
- **R2 — Datos existentes ambiguos.** Un `closed` ya escrito no dice bajo qué lectura
  se escribió. Mitigación: inventariar antes de migrar; si hay filas, decidir caso por
  caso o marcarlas como indeterminadas en vez de reinterpretarlas en masa.
