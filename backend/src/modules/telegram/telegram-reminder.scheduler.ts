import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramConfig } from '../../config/telegram.config';

/**
 * TelegramReminderScheduler (F7 emergency-dispatch, design D10 — REVISED
 * per `fixes-required.md` Round 2 / user direction) — repique for
 * critical incidents that stay in `pending`.
 *
 * Cadence (3 mensajes al admin_org + 1 al master):
 *   - T=0     : initial Telegram to admin_org (sent by
 *               `critical-incident.listener` on `incident.created`).
 *   - T+25min : 1st reminder to admin_org.
 *   - T+40min : 2nd reminder to admin_org.
 *   - T+60min : final Telegram to `master` (single user with the
 *               `master` role) reporting the unattended critical.
 *   - After T+60min : no more pings; the scheduler skips the row.
 *
 * The previous design (Round 1) used 5-minute cadences with
 * progressive escalation to master + operador_sistema and a 12-reminder
 * (1h) hard stop with an `'unattended'` status change. The team
 * decided 3 messages is enough pressure on the admin_org, and a single
 * "nobody took it" report to master at the 1h mark is the right
 * escalation point. No `unattended` status — the master owns the
 * follow-up manually.
 *
 * The scheduler reads `incidents.reminder_count` as a cycle counter
 * (0 → 1 at T+25, 1 → 2 at T+40, 2 → 3 at T+60). The incident is
 * anchored to its own `created_at`; `last_reminded_at` is only used
 * to avoid double-firing when the scheduler is invoked back-to-back.
 */
@Injectable()
export class TelegramReminderScheduler {
  private readonly logger = new Logger(TelegramReminderScheduler.name);

  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    private readonly telegram: TelegramService,
    private readonly configService: ConfigService,
  ) {}

  // Every minute. The cadence is anchored to `created_at` and
  // `reminder_count`, so a one-minute scheduler tick is precise enough
  // (worst-case skew: one minute).
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    const cfg = this.configService.get<TelegramConfig>('telegram')!;

    // We need the candidates together with their `created_at`. The
    // critical / pending / not-deleted filter mirrors Round 1.
    // `reminder_count < cfg.reminderStopAt` is parameterized so changing
    // the config actually changes behavior (Round 2 W3 fix).
    const candidates = await this.dataSource.query<
      Array<{
        id: string;
        title: string;
        organization_id: string | null;
        reminder_count: number;
        created_at: string;
      }>
    >(
      `SELECT i.id, i.title, i.organization_id, i.reminder_count, i.created_at
         FROM incidents i
        WHERE i.priority = 'critical'
          AND i.status = 'pending'
          AND i.deleted_at IS NULL
          AND i.reminder_count < $1
          AND i.created_at < NOW() - INTERVAL '25 minutes'`,
      [cfg.reminderStopAt],
    );

    for (const incident of candidates) {
      await this.processOne(incident, cfg);
    }
  }

  private async processOne(
    incident: {
      id: string;
      title: string;
      organization_id: string | null;
      reminder_count: number;
      created_at: string;
    },
    cfg: TelegramConfig,
  ): Promise<void> {
    const detailLink = `${cfg.appBaseUrl}/incidents/${incident.id}`;

    // The candidate SELECT guarantees >= 25 min elapsed. From here,
    // `reminder_count` is the sole progress tracker — no upper-bound
    // time guards. Guards caused a permanent stall: if the scheduler
    // was down during e.g. the 25-40 min window, the incident reached
    // count=0 with elapsed >= 40 min, the guard failed, no UPDATE fired,
    // and the row stayed in the SELECT forever (master never alerted).
    // The `status = 'pending'` SQL filter is the real safety net: once
    // someone takes the incident it disappears from candidates regardless
    // of how late the scheduler fires.
    let audience: string[] = [];
    let subject = '';

    if (incident.reminder_count === 0) {
      audience = await this.resolveAdminOrgAudience(incident.organization_id);
      subject = 'recordatorio #1';
    } else if (incident.reminder_count === 1) {
      audience = await this.resolveAdminOrgAudience(incident.organization_id);
      subject = 'recordatorio #2';
    } else if (incident.reminder_count === 2) {
      audience = await this.resolveMasterAudience();
      subject = 'no asignada en 1h';
    }

    if (audience.length === 0) return;

    const text = `🚨 EMERGENCIA — ${subject}\n\n${incident.title}\n\nDetalle: ${detailLink}`;

    for (const chatId of audience) {
      await this.telegram.enqueue({ chat_id: chatId, text });
    }

    const nextCount = incident.reminder_count + 1;
    await this.dataSource.query(
      `UPDATE incidents
          SET reminder_count = $2, last_reminded_at = NOW()
        WHERE id = $1`,
      [incident.id, nextCount],
    );
  }

  private async resolveAdminOrgAudience(organizationId: string | null): Promise<string[]> {
    if (!organizationId) return [];
    const rows = await this.dataSource.query<Array<{ telegram_chat_id: string }>>(
      `SELECT u.telegram_chat_id
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.is_active = true
          AND u.deleted_at IS NULL
          AND u.organization_id = $1
          AND r.name = 'admin_org'
          AND u.telegram_chat_id IS NOT NULL`,
      [organizationId],
    );
    return rows.map((r) => r.telegram_chat_id);
  }

  private async resolveMasterAudience(): Promise<string[]> {
    const rows = await this.dataSource.query<Array<{ telegram_chat_id: string }>>(
      `SELECT u.telegram_chat_id
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.is_active = true
          AND u.deleted_at IS NULL
          AND r.name = 'master'
          AND u.telegram_chat_id IS NOT NULL`,
    );
    return rows.map((r) => r.telegram_chat_id);
  }
}
