import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';

import { MAIL_EVENTS_BLOCKING_CLIENT } from '../../infra/core.module';
import { resolveCommentAudience } from '../../shared/events/comment-audience';
import { UserEntity } from '../users/entities/user.entity';
import { INCIDENTS_STREAM_KEY } from '../incidents/incidents.service';
import { decodeStreamEntry } from '../realtime/stream-event.util';
import { MailService } from './mail.service';
import { TemplateName } from './templates/mail-templates';

export const INCIDENT_MAIL_CONSUMER_GROUP = 'mail';

/** Pause after a failed read so a Redis outage cannot spin the loop hot (mirrors streams.consumer.ts). */
export const RETRY_BACKOFF_MS = 1000;

/**
 * IncidentMailListener (design D8/D10) — its own consumer group (`mail`,
 * same group name as `MailOutboxConsumer` uses on the *other* stream, but
 * a distinct group registration here on `incidents:events`) split from
 * `realtime`'s group on the same stream (D7): Streams consumer groups are
 * independent per-group cursors, so `mail` and `realtime` each see every
 * event exactly once without coordinating. Zero import edges from
 * Incidents into Mail — this listener never imports IncidentsService or
 * CommentsService. It reads the stream Incidents already publishes to, and
 * listens on the in-process bus for `comment.added` (which Comments
 * publishes only there).
 */
@Injectable()
export class IncidentMailListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentMailListener.name);
  private readonly consumerName = `mail-events-consumer-${process.pid}-${Math.random().toString(36).slice(2)}`;
  private running = false;

  constructor(
    // Dedicated connection (D13) — separate from MailOutboxConsumer's own
    // blocking client and from RealtimeStreamsConsumer's: a slow SMTP
    // delivery must never stall event ingestion, and vice versa (D8).
    @Inject(MAIL_EVENTS_BLOCKING_CLIENT) private readonly redis: Redis,
    private readonly mailService: MailService,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', INCIDENTS_STREAM_KEY, INCIDENT_MAIL_CONSUMER_GROUP, '$', 'MKSTREAM');
    } catch (err) {
      if (!(err as Error).message?.includes('BUSYGROUP')) {
        this.logger.error(`Failed to create mail-events consumer group: ${(err as Error).message}`);
      }
    }
    this.running = true;
    void this.loop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.redis.quit().catch(() => undefined);
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const response = await this.redis.xreadgroup(
          'GROUP',
          INCIDENT_MAIL_CONSUMER_GROUP,
          this.consumerName,
          'COUNT',
          10,
          'BLOCK',
          5000,
          'STREAMS',
          INCIDENTS_STREAM_KEY,
          '>',
        );
        if (response) {
          await this.processResponse(response as unknown as [string, [string, string[]][]][]);
        }
      } catch (err) {
        if (!this.running) {
          break;
        }
        this.logger.error(`Mail-events listener loop error: ${(err as Error).message}`);
        await this.sleep(RETRY_BACKOFF_MS);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Always XACKs, whether or not the event routed to a template — an
   * unresolvable/missing recipient or an event type this listener does
   * not handle is never a retry loop (design D10).
   */
  async processResponse(response: [string, [string, string[]][]][]): Promise<void> {
    for (const [, entries] of response) {
      for (const [entryId, fields] of entries) {
        const event = decodeStreamEntry(fields);
        if (event) {
          await this.route(event.type, event.data);
        }
        await this.redis.xack(INCIDENTS_STREAM_KEY, INCIDENT_MAIL_CONSUMER_GROUP, entryId);
      }
    }
  }

  private async route(type: string, data: Record<string, unknown>): Promise<void> {
    switch (type) {
      case 'incident.created':
        await this.handleIncidentCreated(data);
        break;
      case 'incident.assigned':
        await this.handleIncidentAssigned(data);
        break;
      case 'incident.status_changed':
        await this.handleStatusChanged(data);
        break;
      default:
        // Every other event on incidents:events (e.g. types this listener
        // does not translate to mail) is intentionally ignored.
        //
        // `comment.added` used to be listed here as `comment.created`,
        // and that case could never fire — for two independent reasons.
        // The producer emits `comment.added`, never `comment.created`; and
        // `CommentsService` publishes to the EventEmitter only, it never
        // XADDs to `incidents:events`, which is the stream this listener
        // reads. The handler lives further down, on `@OnEvent`.
        break;
    }
  }

  /**
   * 2026-10-20 — this handler used to sit in `route()` as a `comment.created`
   * case, where it was unreachable on both counts. It now listens on the
   * in-process bus, which is the channel `CommentsService` actually
   * publishes to (`comments.service.ts:66`).
   *
   * Deliberately NOT wired into the Redis stream: publishing comments to
   * `incidents:events` would also hand them to `RealtimeStreamsConsumer`,
   * which forwards every entry to the WebSocket gateway unfiltered
   * (`streams.consumer.ts:96-106`). Whether comments should be realtime is
   * a product decision, and taking it here would be a change of behaviour
   * disguised as a bug fix.
   *
   * The audience comes from `shared/events/comment-audience.ts` — the same
   * resolver the in-app notification listener uses. Two copies of that rule
   * would drift, and when they drift one channel notifies and the other
   * does not, silently.
   */
  @OnEvent('comment.added')
  async onCommentAdded(payload: {
    id: string;
    incidentId: string;
    userId: string;
    content: string;
    parentId: string | null;
  }): Promise<void> {
    const audience = await resolveCommentAudience(
      this.dataSource,
      payload.incidentId,
      payload.userId,
    );
    const recipientIds = [audience.reporterId, ...audience.priorCommenterIds].filter(
      (id): id is string => Boolean(id) && id !== payload.userId,
    );
    await this.enqueueToUsers(recipientIds, 'comment.created', {
      content: payload.content,
    });
  }

  /**
   * F7 emergency-dispatch (post-Round-2) — `incident.created` only
   * notifies by mail when the incident is **critical** AND the
   * organisation was resolved. The audience is the **admin_org** users
   * of that organisation, mirroring the Telegram listener's audience
   * (`critical-incident.listener.ts`). Low/medium/high priority and
   * org-less incidents deliberately do not send mail — that's what
   * `incident.assigned` / `incident.status_changed` already cover for
   * the operator working the ticket.
   *
   * Previously the listener also fired an "acuse de recibo" to the
   * citizen (`citizen_id` in `data`); removed per requirements: the
   * reporter never gets a copy of their own report.
   */
  private async handleIncidentCreated(data: Record<string, unknown>): Promise<void> {
    const priority = typeof data.priority === 'string' ? data.priority : null;
    if (priority !== 'critical') {
      // Low / medium / high: no mass email on creation.
      return;
    }
    const organizationId = (data.organization_id as string | null | undefined) ?? null;
    if (!organizationId) {
      // Critical but no zone match → no audience; nothing to enqueue.
      this.logger.debug(
        `incident.created: critical incident ${String(data.id)} has no organization; no admin_org mail`,
      );
      return;
    }

    const mailData = {
      title: data.title,
      description: data.description,
      incidentId: data.id,
    };
    const emails = await this.getOrgAdminEmails(organizationId);
    await this.enqueueToEmails(emails, 'incident.created', mailData);
  }

  private async handleIncidentAssigned(data: Record<string, unknown>): Promise<void> {
    const assigneeId = data.operatorId as string | undefined;
    if (!assigneeId) {
      return;
    }
    await this.enqueueToUsers([assigneeId], 'incident.assigned', { title: data.title ?? data.incidentId });
  }

  private async handleStatusChanged(data: Record<string, unknown>): Promise<void> {
    const reporterId = data.citizen_id as string | undefined;
    const assigneeId = data.assigned_to as string | undefined | null;
    const recipientIds = [reporterId, assigneeId].filter((id): id is string => Boolean(id));
    await this.enqueueToUsers(recipientIds, 'incident.status_changed', {
      title: data.title,
      status: data.status,
    });
  }

  /** Resolves each id to an email (null -> skip + debug log, never retried) and enqueues one mail per resolved recipient. */
  private async enqueueToUsers(
    userIds: string[],
    template: TemplateName,
    data: Record<string, unknown>,
  ): Promise<void> {
    const uniqueIds = [...new Set(userIds)];
    for (const userId of uniqueIds) {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user || !user.email) {
        this.logger.debug(`Skipping mail for user ${userId}: no email on file`);
        continue;
      }
      await this.mailService.enqueue({
        to: user.email,
        subject: this.subjectFor(template, data),
        template,
        data,
      });
    }
  }

  /** Enqueues directly to already-resolved email addresses (admin list — resolved as part of the same query, no per-user lookup needed). */
  private async enqueueToEmails(
    emails: string[],
    template: TemplateName,
    data: Record<string, unknown>,
  ): Promise<void> {
    for (const email of [...new Set(emails)]) {
      await this.mailService.enqueue({ to: email, subject: this.subjectFor(template, data), template, data });
    }
  }

  private subjectFor(template: TemplateName, data: Record<string, unknown>): string {
    const title = typeof data.title === 'string' ? data.title : '';
    switch (template) {
      case 'incident.created':
        return `Critical incident reported: ${title}`;
      case 'incident.assigned':
        return `Incident assigned to you: ${title}`;
      case 'incident.status_changed':
        return `Incident status changed: ${title}`;
      case 'comment.created':
        return 'New comment on your incident';
      default:
        return 'Transito Alerta SE notification';
    }
  }

  /**
   * F7 audience resolution (mirrors `critical-incident.listener.ts`):
   *   - role = `admin_org` (the post-0040 admin role; the legacy
   *     `'admin'` name is dead since the role rename migration).
   *   - `organization_id` = the incident's resolved org.
   *   - active and not soft-deleted.
   *
   * The query is keyed by `(organization_id, role)` and runs once per
   * critical incident (a rare event). No in-process memo — if this
   * ever shows up in a profile we'd rather rely on the role-reassignment
   * contract than a stale TTL. Users without an email are filtered
   * client-side to match `enqueueToEmails`'s contract.
   */
  private async getOrgAdminEmails(organizationId: string): Promise<string[]> {
    const rows = await this.dataSource.query<Array<{ email: string | null }>>(
      `SELECT u.email
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.is_active = true
          AND u.deleted_at IS NULL
          AND u.organization_id = $1
          AND r.name = 'admin_org'`,
      [organizationId],
    );
    return rows.map((row) => row.email).filter((email): email is string => Boolean(email));
  }
}
