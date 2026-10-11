import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramService } from './telegram.service';
import { TelegramConfig } from '../../config/telegram.config';

/**
 * F7 — 2026-10-10-user-onboarding-telegram-tour (D3/D4/D7). The
 * webhook controller's job is narrow: validate the secret, parse
 * `/start <token>`, look up the user, persist the chat_id, enqueue
 * the tour. Everything else is downstream.
 */
describe('TelegramBotController', () => {
  let linkService: { consume: jest.Mock; composeDeepLink: jest.Mock };
  let telegram: { enqueue: jest.Mock };
  let dataSource: { query: jest.Mock };
  let configService: { get: jest.Mock };
  let controller: TelegramBotController;

  const cfg: TelegramConfig = {
    botToken: undefined,
    botUsername: 'tase_alert_bot',
    webhookSecret: 'shh-secret',
    appBaseUrl: 'http://app.test',
    sweepIntervalMs: 10_000,
    claimIdleMs: 30_000,
    maxAttempts: 3,
    reminderIntervalMs: 25 * 60 * 1000,
    reminderStopAt: 3,
    linkTokenTtlSeconds: 86_400,
  };

  beforeEach(() => {
    linkService = {
      consume: jest.fn().mockResolvedValue('user-1'),
      composeDeepLink: jest.fn().mockReturnValue('https://t.me/x?start=tok'),
    };
    telegram = { enqueue: jest.fn().mockResolvedValue('1-0') };
    dataSource = { query: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(cfg) };
    controller = new TelegramBotController(
      configService as unknown as ConfigService,
      linkService as unknown as TelegramLinkService,
      telegram as unknown as TelegramService,
      dataSource as unknown as DataSource,
    );
  });

  describe('webhook security (D3)', () => {
    it('returns 200 only when the secret header matches (callers see 200 + ok)', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'user-1', role: 'admin_org', deleted_at: null },
      ]);

      const res = await controller.webhook('shh-secret', {
        message: { chat: { id: 111 }, text: '/start tok' },
      });

      expect(res).toEqual({ ok: true });
    });

    it('throws UnauthorizedException when the secret header is missing', async () => {
      await expect(
        controller.webhook(undefined, { message: { text: '/start tok' } }),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('throws UnauthorizedException when the secret header is wrong', async () => {
      await expect(
        controller.webhook('nope', { message: { text: '/start tok' } }),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('throws UnauthorizedException when TELEGRAM_WEBHOOK_SECRET is not configured', async () => {
      configService.get.mockReturnValue({ ...cfg, webhookSecret: undefined });
      await expect(
        controller.webhook('shh-secret', { message: { text: '/start tok' } }),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('webhook flow (D4)', () => {
    it('ignores updates that are not /start', async () => {
      const res = await controller.webhook('shh-secret', {
        message: { chat: { id: 1 }, text: 'hello bot' },
      });
      expect(res).toEqual({ ok: true });
      expect(linkService.consume).not.toHaveBeenCalled();
    });

    it('replies with the "expired link" message when the token is unknown', async () => {
      linkService.consume.mockResolvedValue(null);
      const res = await controller.webhook('shh-secret', {
        message: { chat: { id: 1 }, text: '/start unknown' },
      });
      expect(res).toEqual({ ok: true });
      expect(telegram.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: '1',
          text: expect.stringMatching(/expirado|no es válido/),
        }),
      );
    });

    it('persists chat_id and enqueues the tour for an admin_org user', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'user-1', role: 'admin_org', deleted_at: null },
      ]);

      await controller.webhook('shh-secret', {
        message: { chat: { id: 222 }, text: '/start valid-token' },
      });

      // Persisted
      expect(dataSource.query).toHaveBeenCalledWith(
        `UPDATE users SET telegram_chat_id = $1 WHERE id = $2`,
        ['222', 'user-1'],
      );
      // Tour enqueued
      expect(telegram.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: '222',
          text: expect.stringMatching(/Administrador de Organización/),
        }),
      );
    });

    it('D7: rejects tour for a `reporter` citizen, but still binds the chat_id', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'citizen-1', role: 'reporter', deleted_at: null },
      ]);

      await controller.webhook('shh-secret', {
        message: { chat: { id: 333 }, text: '/start valid-token' },
      });

      // Persisted
      expect(dataSource.query).toHaveBeenCalledWith(
        `UPDATE users SET telegram_chat_id = $1 WHERE id = $2`,
        ['333', 'citizen-1'],
      );
      // No tour sent — but a graceful fallback message instead.
      expect(telegram.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: '333',
          text: expect.stringMatching(/personal interno|ciudadano|vinculada/),
        }),
      );
    });

    it('refuses to act when the user is soft-deleted', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 'user-1', role: 'admin_org', deleted_at: new Date() },
      ]);

      await controller.webhook('shh-secret', {
        message: { chat: { id: 444 }, text: '/start valid-token' },
      });

      // No UPDATE was issued (no chat_id binding for a deleted user).
      const updateCalls = dataSource.query.mock.calls.filter((c) =>
        String(c[0]).startsWith('UPDATE users'),
      );
      expect(updateCalls).toHaveLength(0);
      // The handler told the user the account is no longer active.
      expect(telegram.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: '444',
          text: expect.stringMatching(/ya no está activo/),
        }),
      );
    });

    it('token consumption is one-shot — the second call with the same token is rejected', async () => {
      // First call wins; second call sees null.
      linkService.consume
        .mockResolvedValueOnce('user-1')
        .mockResolvedValueOnce(null);
      dataSource.query.mockResolvedValue([
        { id: 'user-1', role: 'admin_org', deleted_at: null },
      ]);

      await controller.webhook('shh-secret', {
        message: { chat: { id: 555 }, text: '/start once' },
      });
      await controller.webhook('shh-secret', {
        message: { chat: { id: 555 }, text: '/start once' },
      });

      // Only the first call should have written the chat_id.
      const updateCalls = dataSource.query.mock.calls.filter((c) =>
        String(c[0]).startsWith('UPDATE users'),
      );
      expect(updateCalls).toHaveLength(1);
    });
  });
});
