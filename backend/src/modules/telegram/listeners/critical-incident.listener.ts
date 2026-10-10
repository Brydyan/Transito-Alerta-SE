import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { TelegramService } from '../telegram.service';
import { TelegramConfig } from '../../../config/telegram.config';
import { ConfigService } from '@nestjs/config';

/**
 * CriticalIncidentListener (F7 emergency-dispatch, design D5/D6/B.3) —
 * reacts to `incident.created` with `priority = 'critical'`. Resolves
 * the admin_org users of the incident's organization that have a
 * `telegram_chat_id` set, then enqueues one Telegram message per
 * recipient.
 *
 * D5: this listener NEVER calls the Telegram HTTP API. The enqueue is
 * a non-blocking XADD onto `telegram:outbox`; the consumer delivers it
 * out of band. A synchronous API call would mean a Telegram outage
 * blocks the report of an emergency — exactly the failure mode the
 * outbox exists to prevent (R1).
 *
 * D6: the recipient is `users.telegram_chat_id`, NOT a column on
 * `organizations`. The seed already creates two admins per org
 * (admin-org-1, admin-org-2) and either or both can be notified.
 *
 * Edge cases (must NOT fail the call):
 *  - Admin without telegram_chat_id → skip silently.
 *  - Organization with no admins configured → no enqueue, the repique
 *    scheduler handles the unattended case.
 *  - Incident without organization_id → nothing to fan out to, log only.
 */
@Injectable()
export class CriticalIncidentListener {
  private readonly logger = new Logger(CriticalIncidentListener.name);

  constructor(
    private readonly telegram: TelegramService,
    @Inject(DataSource) private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @OnEvent('incident.created')
  async onIncidentCreated(payload: {
    incidentId: string;
    title: string;
    description?: string | null;
    categoryName?: string | null;
    priority: string;
    organizationId: string | null;
    location?: { lat: number; lng: number } | null;
  }): Promise<void> {
    if (payload.priority !== 'critical') return;
    if (!payload.organizationId) {
      this.logger.debug(
        `[critical-incident] ${payload.incidentId} has no organization; no Telegram fan-out`,
      );
      return;
    }

    // Resolve admin_org users of the incident's organization with a
    // configured chat id. Inactive users and users without a chat id
    // are excluded.
    const rows = await this.dataSource.query<
      Array<{ telegram_chat_id: string }>
    >(
      `SELECT u.telegram_chat_id
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.is_active = true
          AND u.deleted_at IS NULL
          AND u.organization_id = $1
          AND r.name = 'admin_org'
          AND u.telegram_chat_id IS NOT NULL`,
      [payload.organizationId],
    );

    if (rows.length === 0) {
      this.logger.debug(
        `[critical-incident] ${payload.incidentId} no admin_org with telegram_chat_id in org ${payload.organizationId}`,
      );
      return;
    }

    const cfg = this.configService.get<TelegramConfig>('telegram')!;
    const detailLink = `${cfg.appBaseUrl}/incidents/${payload.incidentId}`;
    const text = this.formatMessage(payload, detailLink);

    for (const row of rows) {
      await this.telegram.enqueue({
        chat_id: row.telegram_chat_id,
        text,
      });
    }
  }

  private formatMessage(
    payload: {
      incidentId: string;
      title: string;
      description?: string | null;
      categoryName?: string | null;
      priority: string;
      location?: { lat: number; lng: number } | null;
    },
    detailLink: string,
  ): string {
    const lines: string[] = [];
    lines.push('🚨 EMERGENCIA — Incidencia crítica');
    lines.push('');
    lines.push(`Título: ${payload.title}`);
    if (payload.categoryName) lines.push(`Categoría: ${payload.categoryName}`);
    lines.push(`Prioridad: ${payload.priority}`);
    if (payload.location) {
      lines.push(
        `Ubicación: https://maps.google.com/?q=${payload.location.lat},${payload.location.lng}`,
      );
    }
    lines.push('');
    lines.push(`Detalle: ${detailLink}`);
    return lines.join('\n');
  }
}
