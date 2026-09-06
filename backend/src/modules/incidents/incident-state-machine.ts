import type { IncidentStatus } from '../../entities/incident.entity';

/**
 * Máquina de estados de incidencias (sc-315 — `2026-08-29-fix-incident-state-machine`).
 *
 * Esta es LA fuente de verdad sobre transiciones válidas en el ciclo de
 * vida de una incidencia. Todo consumidor (servicio de workflow,
 * frontend vía `workflow.util.ts` de F3, reportes, métricas) debe
 * derivar de aquí; replicar la regla con condicionales propios fue la
 * causa original del conflicto entre dos semánticas de `closed`
 * (R1 del change).
 *
 * ## Semántica (D1)
 *
 * ```
 *                  ┌──────────► resolved   (el operador resolvió)
 * pending ──► in_progress
 *                  └──────────► closed     (no pudo resolverse, se dio de baja)
 * ```
 *
 * `resolved` y `closed` son terminales **alternativos**, no consecutivos:
 * una `resolved` NO se puede pasar a `closed` (el bug R1 lo permitía
 * bajo la lectura lineal «archivado tras aprobación»). La distinción
 * entre éxito y fracaso es justamente la que un sistema de gestión de
 * incidencias no puede perder (D1 del design).
 *
 * `pending → closed` existe (D7): un reporte inválido o duplicado no
 * necesita pasar por `in_progress` para descartarse.
 *
 * ## Por qué terminales con `[]` y no omitidos (D2)
 *
 * Una entrada ausente del mapa hace `TRANSITIONS[from]` `undefined` y
 * revienta en tiempo de ejecución; un `[]` permite `canTransition()`
 * rechazar limpio con `false`. La promesa al lector es: las cuatro
 * claves existen siempre.
 *
 * ## Por qué `ALLOWED_STATUSES` derivado (D3)
 *
 * La causa raíz del defecto 1: dos listas de estados mantenidas a mano
 * (una en `incident.entity.ts:8`, otra en
 * `incident-workflow.service.ts:46`) acabaron divergiendo. Con esto,
 * añadir un estado al grafo lo hace visible en `getStatuses()` y en
 * cualquier consumidor que derive de `Object.keys(TRANSITIONS)` sin
 * que pueda volver a quedarse a medio camino.
 *
 * ## Crítica nace en `pending` (D9)
 *
 * El grafo no codifica prioridad, pero documenta la regla: la única
 * transición válida desde «recién creada» es lo que el servicio
 * decida persistir como estado inicial, y ese estado es `pending`
 * (probado en `incidents.service.spec.ts` create-spec y en el
 * default de la entidad). `in_progress` significa «asignada, con
 * seguimiento», afirmación falsa hasta que un operador la reclame.
 */
export const TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  pending: ['in_progress', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved: [],
  closed: [],
};

/**
 * Lista derivada de los estados reconocidos por la máquina (D3).
 * Mantenerla como `const` congelada evita mutaciones accidentales
 * desde un consumidor (era una de las fragilidades del código previo).
 */
export const ALLOWED_STATUSES: ReadonlyArray<IncidentStatus> = Object.freeze(
  Object.keys(TRANSITIONS) as IncidentStatus[],
);

/**
 * Dice si la transición `from → to` está declarada en la máquina.
 * Función pura — sin acceso a la base de datos ni al reloj, para que
 * la UI de F3 (`workflow.util.ts → availableActions()`) pueda derivar
 * acciones disponibles del mismo modo que el backend.
 */
export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
