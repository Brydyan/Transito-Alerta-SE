import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import * as nodemailer from 'nodemailer';

import { MailService, OutboundMail } from './mail.service';

jest.mock('nodemailer');

describe('MailService', () => {
  let redis: { xadd: jest.Mock };
  let config: { get: jest.Mock };
  let service: MailService;

  beforeEach(() => {
    jest.clearAllMocks();
    redis = { xadd: jest.fn().mockResolvedValue('1700000000000-0') };
    config = {
      get: jest.fn().mockReturnValue({
        smtpHost: undefined,
        smtpPort: 587,
        smtpUser: undefined,
        smtpPassword: undefined,
        smtpFrom: 'no-reply@transito-alerta.example',
        sweepIntervalMs: 10_000,
        claimIdleMs: 30_000,
        maxAttempts: 3,
      }),
    };
    service = new MailService(redis as unknown as jest.Mocked<Redis>, config as unknown as ConfigService);
  });

  describe('renderTemplate', () => {
    it('escapes every interpolated {{variable}} value (R13)', () => {
      const html = service.renderTemplate('incident.created', {
        title: '<script>alert(1)</script>',
        description: 'ok',
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('enqueue', () => {
    it('XADDs onto mail:outbox via the injected Redis client and returns the entry id', async () => {
      const msg: OutboundMail = {
        to: 'user@example.com',
        subject: 'Hello',
        template: 'incident.created',
        data: { title: 'x', description: 'y' },
      };

      const id = await service.enqueue(msg);

      expect(id).toBe('1700000000000-0');
      expect(redis.xadd).toHaveBeenCalledWith(
        'mail:outbox',
        '*',
        'to',
        'user@example.com',
        'subject',
        'Hello',
        'template',
        'incident.created',
        'data',
        JSON.stringify({ title: 'x', description: 'y' }),
        'attempts',
        '0',
      );
    });

    it('does not wait for delivery — only the XADD ack (durability, not confirmation)', async () => {
      const msg: OutboundMail = {
        to: 'a@b.com',
        subject: 'S',
        template: 'incident.created',
        data: {},
      };

      await expect(service.enqueue(msg)).resolves.toBe('1700000000000-0');
      expect(redis.xadd).toHaveBeenCalledTimes(1);
    });
  });

  describe('deliver', () => {
    it('attempts SMTP delivery via nodemailer when SMTP_HOST is set', async () => {
      config.get.mockReturnValue({
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'user',
        smtpPassword: 'secret',
        smtpFrom: 'no-reply@transito-alerta.example',
        sweepIntervalMs: 10_000,
        claimIdleMs: 30_000,
        maxAttempts: 3,
      });
      const sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
      service = new MailService(redis as unknown as jest.Mocked<Redis>, config as unknown as ConfigService);

      await service.deliver('user@example.com', 'Subject', 'incident.created', { title: 'x' });

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          port: 587,
          auth: { user: 'user', pass: 'secret' },
        }),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Subject',
          from: 'no-reply@transito-alerta.example',
        }),
      );
    });

    it('logs-only (no nodemailer call) when SMTP_HOST is unset', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      await service.deliver('user@example.com', 'Subject', 'incident.created', { title: 'x' });

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('never logs SMTP_PASSWORD, even when SMTP is configured', async () => {
      config.get.mockReturnValue({
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'user',
        smtpPassword: 'super-secret-password',
        smtpFrom: 'no-reply@transito-alerta.example',
        sweepIntervalMs: 10_000,
        claimIdleMs: 30_000,
        maxAttempts: 3,
      });
      const sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
      service = new MailService(redis as unknown as jest.Mocked<Redis>, config as unknown as ConfigService);
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

      await service.deliver('user@example.com', 'Subject', 'incident.created', { title: 'x' });

      const allLoggedText = [...logSpy.mock.calls, ...debugSpy.mock.calls]
        .flat()
        .map(String)
        .join(' ');
      expect(allLoggedText).not.toContain('super-secret-password');

      logSpy.mockRestore();
      debugSpy.mockRestore();
    });

    it('propagates a transport failure so the caller (consumer) can leave the entry pending for retry', async () => {
      config.get.mockReturnValue({
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'user',
        smtpPassword: 'secret',
        smtpFrom: 'no-reply@transito-alerta.example',
        sweepIntervalMs: 10_000,
        claimIdleMs: 30_000,
        maxAttempts: 3,
      });
      const sendMail = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
      service = new MailService(redis as unknown as jest.Mocked<Redis>, config as unknown as ConfigService);

      await expect(
        service.deliver('user@example.com', 'Subject', 'incident.created', { title: 'x' }),
      ).rejects.toThrow('ECONNREFUSED');
    });
  });
});
