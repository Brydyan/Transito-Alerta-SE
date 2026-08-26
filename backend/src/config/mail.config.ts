import { registerAs } from '@nestjs/config';

export interface MailConfig {
  smtpHost: string | undefined;
  smtpPort: number;
  smtpUser: string | undefined;
  smtpPassword: string | undefined;
  smtpFrom: string;
  /** XPENDING/XCLAIM sweep interval (design D12). */
  sweepIntervalMs: number;
  /** Entries claimed idle longer than this are considered stalled (D12). */
  claimIdleMs: number;
  /** Delivery attempts before an entry moves to `mail:dead` (D12). */
  maxAttempts: number;
  /**
   * T3.6 design (Open Questions resolved) — base URL used to build
   * invitation/`password-reset` links (`${appBaseUrl}/accept-invitation?token=...`).
   * Reuses the existing `FRONTEND_BASE_URL` env var (already shipped in
   * `.env.example` for exactly this purpose) rather than introducing a
   * second, redundant `MAIL_APP_BASE_URL`.
   */
  appBaseUrl: string;
}

/**
 * Mail configuration (T3.5, design D9/D12). `smtpHost` unset is a valid,
 * expected dev/test state — `MailService.deliver` falls back to a
 * log-only transport rather than throwing.
 */
export default registerAs(
  'mail',
  (): MailConfig => ({
    smtpHost: process.env.SMTP_HOST || undefined,
    smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    smtpUser: process.env.SMTP_USER || undefined,
    smtpPassword: process.env.SMTP_PASSWORD || undefined,
    smtpFrom: process.env.SMTP_FROM || 'no-reply@transito-alerta.example',
    sweepIntervalMs: process.env.MAIL_SWEEP_INTERVAL_MS
      ? parseInt(process.env.MAIL_SWEEP_INTERVAL_MS, 10)
      : 10_000,
    // Not exposed in .env.example — 30s is the production default (design
    // D12) and the only reason this reads from env at all is so the e2e
    // harness can shrink it, keeping the sweep-retry scenario fast without
    // faking timers around real Redis I/O.
    claimIdleMs: process.env.MAIL_CLAIM_IDLE_MS ? parseInt(process.env.MAIL_CLAIM_IDLE_MS, 10) : 30_000,
    maxAttempts: 3,
    appBaseUrl: process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000',
  }),
);
