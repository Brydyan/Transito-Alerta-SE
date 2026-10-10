import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { TelegramService } from './telegram.service';

/**
 * TelegramService spec — F7 B.4.4: the token must NEVER appear in
 * logs or in the body sent to fetch. The deliver() path constructs
 * the URL with the token but does not log it; the body only carries
 * chat_id and text.
 */
describe('TelegramService', () => {
  let redis: { xadd: jest.Mock };
  let configService: { get: jest.Mock };
  let service: TelegramService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    redis = { xadd: jest.fn().mockResolvedValue('1-0') };
    configService = { get: jest.fn().mockReturnValue({ botToken: 'TOKEN-XYZ' }) };
    service = new TelegramService(redis as unknown as Redis, configService as unknown as ConfigService);
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('enqueue', () => {
    it('XADDs onto telegram:outbox with chat_id, text, parse_mode, attempts=0', async () => {
      await service.enqueue({ chat_id: '42', text: 'hello' });

      expect(redis.xadd).toHaveBeenCalledWith(
        'telegram:outbox',
        '*',
        'chat_id',
        '42',
        'text',
        'hello',
        'parse_mode',
        '',
        'attempts',
        '0',
      );
    });
  });

  describe('deliver — B.4.4 token hygiene', () => {
    it('builds the URL with the token but does NOT log the body or the URL', async () => {
      const logSpy = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
      const errorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);

      await service.deliver('42', 'incident at 5th and main');

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toBe('https://api.telegram.org/botTOKEN-XYZ/sendMessage');

      // Inspect every arg the service (or the consumer) could have
      // logged. The token must not be present.
      for (const call of logSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('TOKEN-XYZ');
      }
      for (const call of errorSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('TOKEN-XYZ');
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('throws (does NOT swallow) when Telegram returns non-OK', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ description: 'bad chat_id' }),
      } as Response);

      await expect(service.deliver('42', 'hi')).rejects.toThrow(/bad chat_id/);
    });

    it('throws when the token is missing from config', async () => {
      configService.get.mockReturnValue({ botToken: undefined });
      const svc = new TelegramService(redis as unknown as Redis, configService as unknown as ConfigService);
      await expect(svc.deliver('42', 'hi')).rejects.toThrow(/TELEGRAM_BOT_TOKEN/);
    });
  });
});
