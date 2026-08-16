import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';

import { MAIL_EVENTS_BLOCKING_CLIENT } from '../../core/core.module';
import { UserEntity } from '../../entities/user.entity';
import { INCIDENTS_STREAM_KEY } from '../incidents/incidents.service';
import { decodeStreamEntry } from '../realtime/stream-event.util';
import { MailService } from './mail.service';
import { TemplateName } from './templates/mail-templates';

export const INCIDENT_MAIL_CONSUMER_GROUP = 'mail';

/** Pause after a failed read so a Redis outage cannot spin the loop hot (mirrors streams.consumer.ts). */
export const RETRY_BACKOFF_MS = 1000;

/** In-process admin-list memoisation window (design D10 — a short TTL, not the perm: cache). */
const ADMIN_LIST_TTL_MS = 60_000;

interface CachedAdmins {
  emails: string[];
  expiresAt: number;
}

/**
 * IncidentMailListener (design D8/D10) — its own consumer group (`mail`,
 * same group name as `MailOutboxConsumer` uses on the *other* stream, but
 * a distinct group registration here on `incidents:events`) split from
 * `realtime`'s group on the same stream (D7): Streams consumer groups are
 * independent per-group cursors, so `mail` and `realtime` each see every
 * event exactly once without coordinating. Zero import edges from
 * Incidents into Mail — this class only ever reads the stream Incidents
 * already publishes to, never imports IncidentsService/CommentsService.
 */
@Injectable()
export class IncidentMailListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentMailListener.name);
  private readonly consumerName = `mail-events-consumer-${process.pid}-${Math.random().toString(36).slice(2)}`;
  private running = false;
  private adminCache: CachedAdmins | null = null;

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
      case 'comment.created':
        await this.handleCommentCreated(data);
        break;
      default:
        // Every other event on incidents:events (e.g. types this listener
        // does not translate to mail) is intentionally ignored.
        break;
    }
  }

  private async handleIncidentCreated(data: Record<string, unknown>): Promise<void> {
    const reporterId = data.citizen_id as string | undefined;
    const mailData = { title: data.title, description: data.description };
    await this.enqueueToUsers(
      [reporterId].filter((id): id is string => Boolean(id)),
      'incident.created',
      mailData,
    );
    await this.enqueueToEmails(await this.getAdminEmails(), 'incident.created', mailData);
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

  private async handleCommentCreated(data: Record<string, unknown>): Promise<void> {
    const reporterId = data.reporter_id as string | undefined;
    const priorCommenterIds = (data.prior_commenter_ids as string[] | undefined) ?? [];
    const recipientIds = [reporterId, ...priorCommenterIds].filter((id): id is string => Boolean(id));
    await this.enqueueToUsers(recipientIds, 'comment.created', { content: data.content });
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
        return `New incident reported: ${title}`;
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
   * Admin resolution (D10) — reads `users` joined to `roles` by
   * `role_id`, memoised in-process for ADMIN_LIST_TTL_MS. Deliberately
   * NOT the `perm:` cache: that one is keyed per-user and owned by Auth's
   * own invalidation contract (role reassignment bumps `permission_version`
   * — coupling Mail to it would mean an admin list going stale for reasons
   * that have nothing to do with mail).
   */
  private async getAdminEmails(): Promise<string[]> {
    const now = Date.now();
    if (this.adminCache && this.adminCache.expiresAt > now) {
      return this.adminCache.emails;
    }

    const rows = await this.dataSource.query<Array<{ id: string; email: string | null }>>(
      `SELECT u.id, u.email FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE r.name = 'admin' AND u.is_active = true`,
    );
    const emails = rows.map((row) => row.email).filter((email): email is string => Boolean(email));
    this.adminCache = { emails, expiresAt: now + ADMIN_LIST_TTL_MS };
    return emails;
  }
}
