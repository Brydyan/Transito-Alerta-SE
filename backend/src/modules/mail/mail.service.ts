import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import * as nodemailer from 'nodemailer';

import { REDIS_CLIENT } from '../../core/core.module';
import { MailConfig } from '../../config/mail.config';
import { renderMailTemplate, TemplateName } from './templates/mail-templates';
import { PRODUCT_NAME } from './product-name';

export const MAIL_OUTBOX_STREAM_KEY = 'mail:outbox';
export const MAIL_DEAD_STREAM_KEY = 'mail:dead';

export interface OutboundMail {
  to: string;
  subject: string;
  template: TemplateName;
  data: Record<string, unknown>;
}

/**
 * MailService (design D9) — the only writer onto `mail:outbox` and the
 * only place nodemailer is invoked. `enqueue` is a non-blocking XADD used
 * by producers (Invitations, IncidentMailListener); `deliver` is called by
 * `MailOutboxConsumer` after it has claimed an entry. Kept as two entry
 * points, not one, because a producer must never accidentally trigger a
 * synchronous SMTP send (that would defeat the entire point of the outbox
 * — R9 durability, non-blocking enqueue).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  /** Non-blocking XADD onto `mail:outbox`. Returns the stream entry id — an ack, not a delivery confirmation. */
  async enqueue(msg: OutboundMail): Promise<string> {
    return this.redis.xadd(
      MAIL_OUTBOX_STREAM_KEY,
      '*',
      'to',
      msg.to,
      'subject',
      msg.subject,
      'template',
      msg.template,
      'data',
      JSON.stringify(msg.data),
      'attempts',
      '0',
    ) as unknown as string;
  }

  /** Escaped-HTML body for a named template (R13 — no template engine, see mail-templates.ts). */
  renderTemplate(name: TemplateName, data: Record<string, unknown>): string {
    return renderMailTemplate(name, data);
  }

  /**
   * Renders and sends a single entry. Called by `MailOutboxConsumer` after
   * a successful claim, never by producers directly. Rejects on transport
   * failure so the caller can decide the retry/DLQ outcome (design D12) —
   * this method itself never swallows a send error.
   */
  async deliver(
    to: string,
    subject: string,
    template: TemplateName,
    data: Record<string, unknown>,
  ): Promise<void> {
    const html = this.renderTemplate(template, data);
    await this.deliverViaSmtp(to, subject, html);
  }

  private async deliverViaSmtp(to: string, subject: string, html: string): Promise<void> {
    const mailConfig = this.configService.get<MailConfig>('mail')!;

    if (!mailConfig.smtpHost) {
      // Dev/test fallback (spec: "SMTP unconfigured") — log the intended
      // send and return without error so the consumer XACKs normally.
      this.logger.log(`[log-only] mail to=${to} subject="${subject}"`);
      return;
    }

    const transport = nodemailer.createTransport({
      host: mailConfig.smtpHost,
      port: mailConfig.smtpPort,
      auth:
        mailConfig.smtpUser || mailConfig.smtpPassword
          ? { user: mailConfig.smtpUser, pass: mailConfig.smtpPassword }
          : undefined,
    });

    // SMTP_PASSWORD is deliberately never interpolated into any log line
    // here or above (R13) — only host/user/subject, never the secret.
    this.logger.log(`sending mail to=${to} subject="${subject}" host=${mailConfig.smtpHost}`);

    await transport.sendMail({
      to,
      subject,
      html,
      // H.2 (ronda 14, D11) — el remitente lleva nombre visible,
      // no la dirección pelada. Sin nombre, en la bandeja se
      // lee «no-reply@georeporta.twintailcs.xyz», y eso es lo
      // primero que decide si el titular abre o marca como no
      // deseado. El nombre viene de la constante
      // `PRODUCT_NAME` — un solo sitio.
      from: `${PRODUCT_NAME} <${mailConfig.smtpFrom}>`,
    });
  }
}
