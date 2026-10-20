import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { TelegramService } from '../telegram.service';
import { TelegramConfig } from '../../../config/telegram.config';
import { ConfigService } from '@nestjs/config';
import { buildIncidentDetailLink } from '../incident-detail-link';

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
/**
 * 2026-10-20 — FORMA DEL PAYLOAD (bug real, encontrado por el e2e
 * `dispatch-workflow.e2e-spec.ts`).
 *
 * `IncidentsService.publish()` emite el payload CRUD (`incidents.service.ts
 * :170,268-271`) y ese `data` es la fila de la base: **snake_case**.
 *
 * Este listener declaraba un payload **camelCase** (`incidentId`,
 * `organizationId`, `categoryName`) que el emisor NUNCA produjo. En runtime
 * `payload.organizationId` llegaba `undefined`, el guard de la línea 52
 * cortaba, y el listener salía sin enviar nada. **La alerta de emergencia por
 * Telegram no funcionó nunca desde que se implementó F7.**
 *
 * El correo sí funcionaba porque `IncidentMailListener` lee el payload real
 * (`data.id`, `data.organization_id`) — o sea, los dos consumidores del mismo
 * evento esperaban convenciones distintas y sólo una era la correcta.
 *
 * `critical-incident.listener.spec.ts` no detectó nada porque invocaba
 * `onIncidentCreated()` con el shape que el listener DESEABA, no el que el
 * emisor produce. Un test de listener que fabrica su propio payload no puede
 * detectar una discrepancia de contrato con el productor.
 *
 * La forma va en snake_case para coincidir con el emisor y con el listener de
 * correo. Si algún día cambia el contrato del stream, hay que cambiar los TRES
 * (emisor + correo + Telegram) juntos.
 */
interface CriticalIncidentPayload {
  id: string;
  title: string;
  description?: string | null;
  /** La fila cruda no trae el nombre de la categoría; el mensaje lo omite. */
  category_name?: string | null;
  priority: string;
  organization_id: string | null;
  location?: { lat: number; lng: number } | null;
}

@Injectable()
export class CriticalIncidentListener {
  private readonly logger = new Logger(CriticalIncidentListener.name);

  constructor(
    private readonly telegram: TelegramService,
    @Inject(DataSource) private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @OnEvent('incident.created')
  async onIncidentCreated(payload: CriticalIncidentPayload): Promise<void> {
    if (payload.priority !== 'critical') return;
    if (!payload.organization_id) {
      this.logger.debug(
        `[critical-incident] ${payload.id} has no organization; no Telegram fan-out`,
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
      [payload.organization_id],
    );

    if (rows.length === 0) {
      this.logger.debug(
        `[critical-incident] ${payload.id} no admin_org with telegram_chat_id in org ${payload.organization_id}`,
      );
      return;
    }

    const cfg = this.configService.get<TelegramConfig>('telegram')!;
    // 2026-10-20 — was `${cfg.appBaseUrl}/incidents/${id}` (404: no such
    // route). See `incident-detail-link.ts` for the route tree.
    const detailLink = buildIncidentDetailLink(cfg.appBaseUrl, payload.id);
    const text = this.formatMessage(payload, detailLink);

    for (const row of rows) {
      await this.telegram.enqueue({
        chat_id: row.telegram_chat_id,
        text,
      });
    }
  }

  private formatMessage(
    payload: CriticalIncidentPayload,
    detailLink: string,
  ): string {
    const lines: string[] = [];
    lines.push('🚨 EMERGENCIA — Incidencia crítica');
    lines.push('');
    lines.push(`Título: ${payload.title}`);
    if (payload.category_name) lines.push(`Categoría: ${payload.category_name}`);
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
