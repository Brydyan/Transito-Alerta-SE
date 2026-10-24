import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { TelegramService } from '../telegram.service';
import { TelegramConfig } from '../../../config/telegram.config';
import { ConfigService } from '@nestjs/config';
import { buildIncidentDetailLink } from '../incident-detail-link';

/**
 * IncidentAssignedListener (F7 emergency-dispatch, design D11/B.6) —
 * reacts to `incident.assigned` and enqueues a complete Telegram
 * message for the assigned operator. The operator's `telegram_chat_id`
 * is read from `users`; if absent, the assignment still happens, the
 * listener just skips the message.
 *
 * D11 — the message includes:
 *  - Título, descripción completa
 *  - Categoría y prioridad
 *  - Ubicación geográfica (coordenadas + enlace Google Maps)
 *  - Enlace directo al detalle
 *  - Si la asignación fue una excepción al tope, el motivo (D9) que
 *    el admin escribió
 *
 * D11 also says ONLY the assigned operator is notified — the broadcast
 * to all operators was the rejected group model.
 */
@Injectable()
export class IncidentAssignedListener {
  private readonly logger = new Logger(IncidentAssignedListener.name);

  constructor(
    private readonly telegram: TelegramService,
    @Inject(DataSource) private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @OnEvent('incident.assigned')
  async onIncidentAssigned(payload: {
    incidentId: string;
    operatorId: string;
    title: string;
    description?: string | null;
    categoryName?: string | null;
    priority?: string | null;
    location?: { lat: number; lng: number } | null;
    capOverrideReason?: string | null;
  }): Promise<void> {
    if (!payload.operatorId) return;

    // 2026-10-20 — se amplía el JOIN con `incidents`.
    //
    // El emisor (`assignments.service.ts:138-143`) publica `...saved` — la
    // fila de `assignments`, que sólo tiene `incident_id`, `operator_id` y
    // los campos de override. `title`, `description`, `categoryName`,
    // `priority` y `location` viven en `incidents`, así que llegaban
    // `undefined` y el mensaje salía como «📋 Nueva tarea: undefined», sin
    // descripción ni link de Maps.
    //
    // Es el mismo desajuste de contrato que el de CriticalIncidentListener,
    // pero más silencioso: el mensaje SÍ se envía, sólo vacío. El correo de
    // asignación suffers lo mismo (`mail-templates.ts:79` interpola
    // `{{title}}`).
    //
    // Se resuelve acá y no en el emisor a propósito: este listener ya hace
    // una query por evento, así que añadir un LEFT JOIN no cuesta nada, y
    // ampliar el contrato del stream obligaría a mover emisor + correo +
    // Telegram juntos por un dato que el emisor no tiene a mano sin otro JOIN.
    const rows = await this.dataSource.query<
      Array<{
        telegram_chat_id: string | null;
        title: string | null;
        description: string | null;
        priority: string | null;
        lat: number | null;
        lng: number | null;
      }>
    >(
      `SELECT u.telegram_chat_id,
              i.title,
              i.description,
              i.priority,
              ST_Y(i.location) AS lat,
              ST_X(i.location) AS lng
         FROM users u
         LEFT JOIN incidents i ON i.id = $2
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [payload.operatorId, payload.incidentId],
    );
    if (rows.length === 0) return;
    const row = rows[0];
    const chatId = row.telegram_chat_id;
    if (!chatId) {
      this.logger.debug(
        `[incident-assigned] operator ${payload.operatorId} has no telegram_chat_id; skipping`,
      );
      return;
    }

    // El resto del mensaje se arma desde la fila leída, no desde el payload
    // del evento: lo que el emisor no trajo, la query lo resuelve.
    const enriched = {
      ...payload,
      title: row.title ?? payload.title,
      description: row.description ?? payload.description,
      priority: row.priority ?? payload.priority,
      location:
        row.lat !== null && row.lng !== null
          ? { lat: Number(row.lat), lng: Number(row.lng) }
          : payload.location,
    };

    const cfg = this.configService.get<TelegramConfig>('telegram')!;
    // 2026-10-20 — was `${cfg.appBaseUrl}/incidents/${id}` (404: no such
    // route). See `incident-detail-link.ts` for the route tree.
    const detailLink = buildIncidentDetailLink(cfg.appBaseUrl, payload.incidentId);
    const text = this.formatMessage(enriched, detailLink);

    await this.telegram.enqueue({ chat_id: chatId, text });
  }

  private formatMessage(
    payload: {
      incidentId: string;
      title: string;
      description?: string | null;
      categoryName?: string | null;
      priority?: string | null;
      location?: { lat: number; lng: number } | null;
      capOverrideReason?: string | null;
    },
    detailLink: string,
  ): string {
    const lines: string[] = [];
    lines.push(`📋 Nueva tarea: ${payload.title}`);
    lines.push('');
    if (payload.description) {
      lines.push(payload.description);
      lines.push('');
    }
    if (payload.categoryName) lines.push(`Categoría: ${payload.categoryName}`);
    if (payload.priority) lines.push(`Prioridad: ${payload.priority}`);
    if (payload.location) {
      lines.push(
        `Ubicación: https://maps.google.com/?q=${payload.location.lat},${payload.location.lng}`,
      );
    }
    lines.push('');
    lines.push(`Detalle: ${detailLink}`);
    if (payload.capOverrideReason) {
      lines.push('');
      lines.push(
        `⚠️ Asignado por encima del tope de carga. Motivo: ${payload.capOverrideReason}`,
      );
    }
    return lines.join('\n');
  }
}
