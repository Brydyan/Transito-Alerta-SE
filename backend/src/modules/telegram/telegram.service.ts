import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infra/core.module';
import { TelegramConfig } from '../../config/telegram.config';

export const TELEGRAM_OUTBOX_STREAM_KEY = 'telegram:outbox';
export const TELEGRAM_DEAD_STREAM_KEY = 'telegram:dead';

/**
 * Outbound payload shape. `chat_id` is required; `text` is what Telegram
 * renders (Telegram supports HTML, but we keep the surface plain text for
 * now and rely on the listener for formatting). `parse_mode` is reserved
 * for the future; left undefined in current sends.
 */
export interface OutboundTelegram {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
}

export type TelegramAudience = 'admin_org' | 'operador_org' | 'master' | 'operador_sistema';

/**
 * TelegramService (F7 emergency-dispatch, design D5) — the only writer onto
 * `telegram:outbox`. Mirrors `MailService.enqueue` verbatim: a non-blocking
 * XADD that returns the stream id (an ack, not a delivery confirmation).
 * The actual HTTP call to `api.telegram.org` happens in
 * `TelegramOutboxConsumer.processEntry` — never here.
 *
 * `deliver()` is invoked by the consumer after it has claimed an entry.
 * It performs the HTTP POST and rejects on transport failure so the
 * consumer can decide retry/DLQ (D8/D12 mirror). Body is sent via
 * `fetch` (Node 22 native, no extra dep). The bot token is read from
 * the config in the consumer context; the service itself does not
 * need it for `enqueue`.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  /** Non-blocking XADD onto `telegram:outbox`. Returns the stream entry id. */
  async enqueue(msg: OutboundTelegram): Promise<string> {
    return this.redis.xadd(
      TELEGRAM_OUTBOX_STREAM_KEY,
      '*',
      'chat_id',
      msg.chat_id,
      'text',
      msg.text,
      'parse_mode',
      msg.parse_mode ?? '',
      'attempts',
      '0',
    ) as unknown as string;
  }

  /**
   * Renders and sends a single entry. Called by `TelegramOutboxConsumer`
   * after a successful claim, never by producers directly. Rejects on
   * transport failure so the caller can decide the retry/DLQ outcome —
   * this method itself never swallows a send error.
   *
   * D8: the token is read from config and put in the URL only. The body
   * does NOT contain the token. The consumer must NOT log the response
   * body (which echoes the `chat_id` only) or the URL (which carries
   * the token) on success.
   */
  async deliver(chatId: string, text: string, parseMode?: 'HTML' | 'MarkdownV2'): Promise<void> {
    const cfg = this.configService.get<TelegramConfig>('telegram')!;
    if (!cfg.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN not configured');
    }
    const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
    const body: Record<string, string> = { chat_id: chatId, text };
    if (parseMode) body.parse_mode = parseMode;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Read the response body for the error code; do NOT include the
      // token. Telegram's error responses echo the `chat_id` and
      // `description` only.
      let reason = `HTTP ${res.status}`;
      try {
        const json = (await res.json()) as { description?: string };
        if (json.description) reason = json.description;
      } catch {
        // ignore JSON parse error
      }
      throw new Error(`Telegram send failed: ${reason}`);
    }
  }
}
