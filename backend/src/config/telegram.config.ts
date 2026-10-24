import { registerAs } from '@nestjs/config';

export interface TelegramConfig {
  /** F7 emergency-dispatch (design D8) — bot token. NEVER in the repo, NEVER logged. */
  botToken: string | undefined;
  /**
   * 2026-10-10-user-onboarding-telegram-tour (D2) — Telegram bot
   * username (the part after `@`), used to compose the deep-link
   * `https://t.me/<botUsername>?start=<token>`. Without this the
   * invitation email has no way to send the user to the bot.
   */
  botUsername: string | undefined;
  /**
   * 2026-10-10-user-onboarding-telegram-tour (D3) — secret the
   * Telegram API includes in the `X-Telegram-Bot-Api-Secret-Token`
   * header on every webhook POST. The controller rejects any
   * request whose header does not match this value with HTTP 401.
   * MUST be set in any environment where the webhook is exposed.
   */
  webhookSecret: string | undefined;
  /** Per-incident detail link prefix — used to build `${appBaseUrl}/incidents/:id`. */
  appBaseUrl: string;
  /** XPENDING/XCLAIM sweep interval, mirrors `mail.config.ts`. */
  sweepIntervalMs: number;
  /** Entries claimed idle longer than this are considered stalled. */
  claimIdleMs: number;
  /** Delivery attempts before an entry moves to `telegram:dead`. */
  maxAttempts: number;
  /** Reminder cadence (D10 — REVISED per `fixes-required.md` Round 2).
   * Three repiques at 25 / 40 / 60 minutes from incident creation. */
  reminderIntervalMs: number;
  /** Max number of Telegram pings per critical-incident cycle
   * (0=initial, 1=25min, 2=40min, 3=60min master). After this the
   * scheduler stops touching the incident. */
  reminderStopAt: number;
  /** 2026-10-10-user-onboarding-telegram-tour (D2) — TTL for a
   * `telegram:link:<token>` entry in Redis. 24h is the design
   * default; the long window is for users who delay the
   * invitation acceptance. */
  linkTokenTtlSeconds: number;
}

/**
 * Telegram configuration (F7 emergency-dispatch, design D5/D8/D10). The
 * `botToken` is intentionally optional: a missing token does NOT crash the
 * boot — the outbox consumer logs a warn and skips, and the listeners
 * still enqueue messages that will sit idle until the token is set.
 *
 * Strict TDD: this file ships before any consumer test runs.
 */
export default registerAs(
  'telegram',
  (): TelegramConfig => ({
    botToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
    appBaseUrl: process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000',
    sweepIntervalMs: process.env.TELEGRAM_SWEEP_INTERVAL_MS
      ? parseInt(process.env.TELEGRAM_SWEEP_INTERVAL_MS, 10)
      : 10_000,
    claimIdleMs: process.env.TELEGRAM_CLAIM_IDLE_MS
      ? parseInt(process.env.TELEGRAM_CLAIM_IDLE_MS, 10)
      : 30_000,
    maxAttempts: process.env.TELEGRAM_MAX_ATTEMPTS
      ? parseInt(process.env.TELEGRAM_MAX_ATTEMPTS, 10)
      : 3,
    reminderIntervalMs: process.env.TELEGRAM_REMINDER_INTERVAL_MS
      ? parseInt(process.env.TELEGRAM_REMINDER_INTERVAL_MS, 10)
      : 25 * 60 * 1000,
    reminderStopAt: 3,
    botUsername: process.env.TELEGRAM_BOT_USERNAME || undefined,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
    linkTokenTtlSeconds: process.env.TELEGRAM_LINK_TTL_SECONDS
      ? parseInt(process.env.TELEGRAM_LINK_TTL_SECONDS, 10)
      : 24 * 60 * 60,
  }),
);
