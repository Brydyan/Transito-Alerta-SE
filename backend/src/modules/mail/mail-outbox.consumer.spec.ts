import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { MailOutboxConsumer, MAIL_OUTBOX_CONSUMER_GROUP } from './mail-outbox.consumer';
import { MAIL_DEAD_STREAM_KEY, MAIL_OUTBOX_STREAM_KEY, MailService } from './mail.service';

function entryFields(overrides: Partial<Record<string, string>> = {}): string[] {
  const map = {
    to: 'user@example.com',
    subject: 'Subject',
    template: 'incident.created',
    data: JSON.stringify({ title: 'x' }),
    attempts: '0',
    ...overrides,
  };
  return Object.entries(map).flat();
}

describe('MailOutboxConsumer', () => {
  let redis: {
    xgroup: jest.Mock;
    xreadgroup: jest.Mock;
    xack: jest.Mock;
    xadd: jest.Mock;
    xpending: jest.Mock;
    xclaim: jest.Mock;
    xrange: jest.Mock;
    quit: jest.Mock;
  };
  let mailService: { deliver: jest.Mock };
  let config: { get: jest.Mock };
  let consumer: MailOutboxConsumer;

  beforeEach(() => {
    redis = {
      xgroup: jest.fn(),
      xreadgroup: jest.fn(),
      xack: jest.fn(),
      xadd: jest.fn(),
      xpending: jest.fn(),
      xclaim: jest.fn(),
      xrange: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
    };
    mailService = { deliver: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn().mockReturnValue({ sweepIntervalMs: 10_000, claimIdleMs: 30_000, maxAttempts: 3 }),
    };
    consumer = new MailOutboxConsumer(
      redis as any,
      mailService as unknown as MailService,
      config as unknown as ConfigService,
    );
  });

  describe('onModuleInit', () => {
    it('creates the mail consumer group with MKSTREAM', async () => {
      redis.xreadgroup.mockResolvedValue(null);
      await consumer.onModuleInit();
      await consumer.onModuleDestroy();

      expect(redis.xgroup).toHaveBeenCalledWith(
        'CREATE',
        MAIL_OUTBOX_STREAM_KEY,
        MAIL_OUTBOX_CONSUMER_GROUP,
        '$',
        'MKSTREAM',
      );
    });

    it('does not log an error when the group already exists (BUSYGROUP)', async () => {
      redis.xgroup.mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists'));
      redis.xreadgroup.mockResolvedValue(null);
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await consumer.onModuleInit();
      await consumer.onModuleDestroy();

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('processEntry', () => {
    it('delivers via MailService and XACKs on success', async () => {
      await consumer.processEntry('1-0', entryFields());

      expect(mailService.deliver).toHaveBeenCalledWith('user@example.com', 'Subject', 'incident.created', {
        title: 'x',
      });
      expect(redis.xack).toHaveBeenCalledWith(MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, '1-0');
      expect(redis.xadd).not.toHaveBeenCalled();
    });

    it('leaves a transient SMTP failure pending — no XACK, no dead-letter (retryable by the sweep)', async () => {
      mailService.deliver.mockRejectedValue(new Error('ECONNREFUSED'));

      await consumer.processEntry('2-0', entryFields());

      expect(redis.xack).not.toHaveBeenCalled();
      expect(redis.xadd).not.toHaveBeenCalled();
    });

    it('sends a malformed payload straight to mail:dead and XACKs the origin (data defect, never retryable)', async () => {
      await consumer.processEntry('3-0', entryFields({ data: 'not-json' }));

      expect(mailService.deliver).not.toHaveBeenCalled();
      expect(redis.xadd).toHaveBeenCalledWith(MAIL_DEAD_STREAM_KEY, '*', ...entryFields({ data: 'not-json' }));
      expect(redis.xack).toHaveBeenCalledWith(MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, '3-0');
    });

    it('sends an unknown template straight to mail:dead (data defect)', async () => {
      mailService.deliver.mockRejectedValue(new Error('Unknown mail template: bogus'));

      await consumer.processEntry('4-0', entryFields({ template: 'bogus' }));

      expect(redis.xadd).toHaveBeenCalledWith(
        MAIL_DEAD_STREAM_KEY,
        '*',
        ...entryFields({ template: 'bogus' }),
      );
      expect(redis.xack).toHaveBeenCalledWith(MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, '4-0');
    });
  });

  describe('sweep', () => {
    it('reclaims an idle-pending entry below max attempts and retries delivery', async () => {
      redis.xpending.mockResolvedValue([['5-0', 'consumer-x', 31_000, 1]]);
      redis.xclaim.mockResolvedValue([['5-0', entryFields()]]);

      await consumer.sweep();

      expect(redis.xclaim).toHaveBeenCalledWith(
        MAIL_OUTBOX_STREAM_KEY,
        MAIL_OUTBOX_CONSUMER_GROUP,
        consumer.consumerName,
        30_000,
        '5-0',
      );
      expect(mailService.deliver).toHaveBeenCalled();
      expect(redis.xack).toHaveBeenCalledWith(MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, '5-0');
    });

    it('moves an entry at max attempts to mail:dead without claiming it again', async () => {
      redis.xpending.mockResolvedValue([['6-0', 'consumer-x', 31_000, 3]]);
      redis.xrange.mockResolvedValue([['6-0', entryFields()]]);

      await consumer.sweep();

      expect(redis.xclaim).not.toHaveBeenCalled();
      expect(redis.xadd).toHaveBeenCalledWith(MAIL_DEAD_STREAM_KEY, '*', ...entryFields());
      expect(redis.xack).toHaveBeenCalledWith(MAIL_OUTBOX_STREAM_KEY, MAIL_OUTBOX_CONSUMER_GROUP, '6-0');
    });

    it('is a no-op when there is nothing idle-pending', async () => {
      redis.xpending.mockResolvedValue([]);

      await consumer.sweep();

      expect(redis.xclaim).not.toHaveBeenCalled();
      expect(redis.xadd).not.toHaveBeenCalled();
    });
  });
});
