import { Pool } from 'pg';

/**
 * 2026-10-22 — Espera activa sobre las filas de `notifications`.
 *
 * ## Por qué existe
 *
 * `EventEmitter2.emit()` NO awaita los handlers `@OnEvent`. Cuando
 * `AssignmentsService.assign()` publica `incident.assigned`, el `POST
 * /api/assignments` devuelve 201 antes de que
 * `IncidentNotificationsListener.onIncidentAssigned` termine su
 * `INSERT`. Consultar la tabla una sola vez es una apuesta: en local el
 * listener gana la carrera casi siempre; en un runner de CI compartido no.
 *
 * El síntoma es un flake con la forma `Expected: 1, Received: 0` en una
 * aserción que "acaba de pasar" — las de `assignments` (síncronas, dentro
 * de la transacción) van bien y sólo cae la de `notifications`. La primera
 * vez que se vio fue en `assignment-priority-coverage.e2e-spec.ts` con el
 * shard 1/4 del workflow.
 *
 * ## Por qué un helper y no tres copias
 *
 * `dispatch-workflow.e2e`, `incident-follow` y
 * `assignment-priority-coverage` necesitan esta espera. Copiada tres
 * veces, divergen: dos ganan el flake por tener timeout corto y una
 *third se olvida. Cuando divergen, un spec verifica el contrato y los
 * otros dos dan verde en silencio. Mismo patrón que motivó
 * `shared/events/comment-audience.ts` para la audiencia de comentarios.
 *
 * ## La aserción negativa es la trampa
 *
 * Este helper también sirve para afirmar que una notificación NO llega.
 * En ese caso hay que darle un plazo corto (`expectNone` con 1s) pero
 * suficiente: si el plazo es 0, la aserción pasa porque el listener
 * todavía no corrió — verde por la razón equivocada. `expectNone`
 * documenta ese riesgo en el nombre del parámetro.
 *
 * ## Dedup de `NotificationsService.notify`
 *
 * El dedup es de 60s por `(user_id, type, incident_id)`. Un spec que
 * hace un solo cambio de status o una sola asignación no lo toca. Uno
 * que reintenta el mismo evento en bucle SÍ lo tocaría, y la segunda
 * fila no aparecería jamás — ahí el timeout es la respuesta correcta,
 * no un bug del listener.
 */

export interface NotificationRow {
  id: string;
  type: string;
  message: string;
  data: unknown;
}

/** Subconjunto de `pg` que necesitamos — narrower = más fácil de testear. */
export interface NotificationQuery {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;

/**
 * Espera a que aparezca al menos una notificación que matchee el filtro.
 *
 * @param expectNone  Plazo corto para afirmar que NUNCA llega. El nombre
 *                    documenta que el resultado depende del timeout: no
 *                    subas el plazo a 15s esperando que no aparezca.
 */
export async function pollForNotification(
  db: NotificationQuery,
  filter: {
    userId: string;
    incidentId: string;
    /** El valor persistido es el del enum: `incident.assigned` con punto. */
    type: string;
    timeoutMs?: number;
    /** `true` ⇒ el plazo es para confirmar ausencia, no para esperar. */
    expectNone?: boolean;
  },
): Promise<NotificationRow | null> {
  const timeoutMs = filter.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await db.query<NotificationRow>(
      `SELECT id, type, message, data
         FROM notifications
        WHERE user_id = $1
          AND incident_id = $2
          AND type = $3
          AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [filter.userId, filter.incidentId, filter.type],
    );

    if (rows.rows.length > 0) return rows.rows[0];

    if (Date.now() >= deadline) {
      if (filter.expectNone) return null;
      // Sin filas y sin `expectNone`: el llamador quería una fila y no
      // llegó. Se lanza desde acá para que el error diga QUÉ se esperaba
      // en vez de un `expect(n).toBe(1)` con un 0 que no explica nada.
      throw new Error(
        `pollForNotification: agotó ${timeoutMs}ms esperando ` +
          `type='${filter.type}' user_id=${filter.userId} incident_id=${filter.incidentId}. ` +
          `Si el listener es el que falla, su catch traga el error y loguea; ` +
          `revisá los logs del backend antes de culpar al timeout.`,
      );
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/** Reexport para que los specs no tengan que importar `pg` sólo por el tipo. */
export type { Pool };