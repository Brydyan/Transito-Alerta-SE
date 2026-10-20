import type { DataSource } from 'typeorm';

/**
 * Quiénes deben enterarse de un comentario nuevo en una incidencia.
 *
 * 2026-10-20 — Este concepto estaba escrito DOS VECES, en dos handlers,
 * con dos nombres de campo que el productor nunca emitió:
 * `IncidentNotificationsListener.onCommentAdded` leía `reporter_id` /
 * `prior_commenter_ids` / `author_id` / `incident_id`, mientras
 * `CommentsService.create()` publica la fila de `CommentEntity`
 * (`id`, `content`, `incidentId`, `userId`, `parentId`). Ninguno de los
 * cuatro campos existía: `recipientIds` quedaba vacío y la notificación
 * in-app de comentarios nunca se creaba. Sin error, sin log.
 *
 * Lo mismo pasó en el canal de correo, donde el handler además esperaba un
 * evento `comment.created` que nadie emite (el real es `comment.added`).
 *
 * Que la resolución viva AQUÍ, y no duplicada en cada consumidor, es
 * deliberado: dos copias de la misma regla divergen — y cuando divergen,
 * un canal avisa y el otro no, sin que nada lo delate. Es el mismo
 * aprendizaje de `assignments.service.ts`, donde el emitter mandaba un
 * payload por un canal y otro por el otro.
 */
export interface CommentAudience {
  /** Quien reportó la incidencia, o null si es anónima. */
  reporterId: string | null;
  /** Quién ya había comentado en ella, sin contar al autor del comentario nuevo. */
  priorCommenterIds: string[];
}

/**
 * Una sola consulta para los dos hechos: quién reportó la incidencia y
 *quiénes habían comentado antes en ella.
 *
 * El autor se excluye dentro de la consulta y no en el handler: el evento
 * se emite DESPUÉS del INSERT (`comments.service.ts:66`), así que el
 * comentario nuevo ya está en la tabla cuando se resuelve la audiencia.
 */
export async function resolveCommentAudience(
  dataSource: DataSource,
  incidentId: string,
  authorId: string,
): Promise<CommentAudience> {
  const rows = await dataSource.query<
    Array<{ reporter_id: string | null; prior_commenter_ids: string[] }>
  >(
    `SELECT i.citizen_id AS reporter_id,
            COALESCE((
              SELECT array_agg(DISTINCT c.user_id)
                FROM comments c
               WHERE c.incident_id = i.id
                 AND c.deleted_at IS NULL
                 AND c.user_id <> $2
            ), '{}') AS prior_commenter_ids
       FROM incidents i
      WHERE i.id = $1`,
    [incidentId, authorId],
  );

  const row = rows[0];
  return {
    reporterId: row?.reporter_id ?? null,
    priorCommenterIds: row?.prior_commenter_ids ?? [],
  };
}