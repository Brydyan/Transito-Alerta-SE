import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { TelegramService } from '../telegram.service';
import { TelegramConfig } from '../../../config/telegram.config';
import { ConfigService } from '@nestjs/config';

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

    const rows = await this.dataSource.query<
      Array<{ telegram_chat_id: string | null }>
    >(
      `SELECT telegram_chat_id FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [payload.operatorId],
    );
    if (rows.length === 0) return;
    const chatId = rows[0].telegram_chat_id;
    if (!chatId) {
      this.logger.debug(
        `[incident-assigned] operator ${payload.operatorId} has no telegram_chat_id; skipping`,
      );
      return;
    }

    const cfg = this.configService.get<TelegramConfig>('telegram')!;
    const detailLink = `${cfg.appBaseUrl}/incidents/${payload.incidentId}`;
    const text = this.formatMessage(payload, detailLink);

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
