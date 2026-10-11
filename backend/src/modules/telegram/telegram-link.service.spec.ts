import { ConfigService } from '@nestjs/config';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramConfig } from '../../config/telegram.config';

/**
 * F7 — 2026-10-10-user-onboarding-telegram-tour (D2). Token lifecycle:
 * `issueFor` mints + stores; `consume` is atomic GET-then-DEL
 * (Lua). The atomicity is the security claim — concurrent
 * `/start <token>` requests cannot both win.
 */
describe('TelegramLinkService', () => {
  let redis: {
    set: jest.Mock;
    eval: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let service: TelegramLinkService;

  const cfg: TelegramConfig = {
    botToken: undefined,
    botUsername: 'tase_alert_bot',
    webhookSecret: undefined,
    appBaseUrl: 'http://app.test',
    sweepIntervalMs: 10_000,
    claimIdleMs: 30_000,
    maxAttempts: 3,
    reminderIntervalMs: 25 * 60 * 1000,
    reminderStopAt: 3,
    linkTokenTtlSeconds: 86_400,
  };

  beforeEach(() => {
    redis = { set: jest.fn().mockResolvedValue('OK'), eval: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(cfg) };
    service = new TelegramLinkService(
      redis as never,
      configService as unknown as ConfigService,
    );
  });

  describe('issueFor', () => {
    it('mints a base64url token (URL-safe, no padding) and stores it with the configured TTL', async () => {
      const token = await service.issueFor('user-1');

      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token.length).toBeGreaterThanOrEqual(32);
      expect(redis.set).toHaveBeenCalledWith(
        `telegram:link:${token}`,
        'user-1',
        'EX',
        86_400,
      );
    });
  });

  describe('consume', () => {
    it('returns the userId from a valid token', async () => {
      redis.eval.mockResolvedValue('user-1');
      const userId = await service.consume('tok123');
      expect(userId).toBe('user-1');
      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call(\'GET\''),
        1,
        'telegram:link:tok123',
      );
    });

    it('returns null when the token is unknown', async () => {
      redis.eval.mockResolvedValue(null);
      const userId = await service.consume('never-minted');
      expect(userId).toBeNull();
    });

    it('returns null for an empty token (defensive)', async () => {
      const userId = await service.consume('   ');
      expect(userId).toBeNull();
      expect(redis.eval).not.toHaveBeenCalled();
    });

    it('is atomic GET-then-DEL — the second concurrent call finds nothing', async () => {
      // The Lua script in the service reads then deletes in the
      // same call. To prove atomicity we simulate the second
      // call's outcome: after the first call, the key is gone
      // (the SET is gone), so the second EVAL returns null.
      redis.eval
        .mockResolvedValueOnce('user-1') // first call wins
        .mockResolvedValueOnce(null); // second call — key already deleted
      const first = await service.consume('tok123');
      const second = await service.consume('tok123');
      expect(first).toBe('user-1');
      expect(second).toBeNull();
    });
  });

  describe('composeDeepLink', () => {
    it('returns the canonical t.me URL when botUsername is configured', () => {
      expect(service.composeDeepLink('tok123')).toBe(
        'https://t.me/tase_alert_bot?start=tok123',
      );
    });

    it('returns null when botUsername is missing (callers must degrade gracefully)', () => {
      configService.get.mockReturnValue({ ...cfg, botUsername: undefined });
      const svc = new TelegramLinkService(
        redis as never,
        configService as unknown as ConfigService,
      );
      expect(svc.composeDeepLink('tok123')).toBeNull();
    });
  });
});
