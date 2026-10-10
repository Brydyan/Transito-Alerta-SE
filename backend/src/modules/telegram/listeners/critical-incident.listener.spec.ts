import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CriticalIncidentListener } from './critical-incident.listener';
import { TelegramService } from '../telegram.service';

/**
 * F7 B.4.1 — non-critical priority MUST NOT enqueue any Telegram
 * message. F7 B.3 — only `admin_org` users of the incident's
 * organization with a `telegram_chat_id` are recipients. F7 B.3
 * edge cases (no org, no admins configured) MUST NOT fail.
 */
describe('CriticalIncidentListener', () => {
  let dataSource: { query: jest.Mock };
  let telegram: { enqueue: jest.Mock };
  let configService: { get: jest.Mock };
  let listener: CriticalIncidentListener;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    telegram = { enqueue: jest.fn().mockResolvedValue('1-0') };
    configService = { get: jest.fn().mockReturnValue({ appBaseUrl: 'http://app.test' }) };
    listener = new CriticalIncidentListener(
      telegram as unknown as TelegramService,
      dataSource as unknown as DataSource,
      configService as unknown as ConfigService,
    );
  });

  it('does NOT enqueue when priority is not critical (B.4.1)', async () => {
    await listener.onIncidentCreated({
      incidentId: 'inc-1',
      title: 'Pothole',
      priority: 'high',
      organizationId: 'org-A',
    });
    expect(telegram.enqueue).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('does NOT enqueue when the incident has no organization (B.3 edge case)', async () => {
    await listener.onIncidentCreated({
      incidentId: 'inc-1',
      title: 'Flood',
      priority: 'critical',
      organizationId: null,
    });
    expect(telegram.enqueue).not.toHaveBeenCalled();
  });

  it('does NOT fail when the organization has no admin_org with telegram_chat_id (B.3 edge case)', async () => {
    dataSource.query.mockResolvedValue([]);
    await listener.onIncidentCreated({
      incidentId: 'inc-1',
      title: 'Flood',
      priority: 'critical',
      organizationId: 'org-A',
    });
    expect(telegram.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues one message per admin_org recipient with a chat_id (B.3 happy path)', async () => {
    dataSource.query.mockResolvedValue([
      { telegram_chat_id: '111' },
      { telegram_chat_id: '222' },
    ]);

    await listener.onIncidentCreated({
      incidentId: 'inc-1',
      title: 'Fire on 5th',
      description: 'building 3, smoke visible',
      categoryName: 'fire',
      priority: 'critical',
      organizationId: 'org-A',
      location: { lat: -2.1, lng: -79.9 },
    });

    expect(telegram.enqueue).toHaveBeenCalledTimes(2);
    const calls = telegram.enqueue.mock.calls;
    expect(calls[0][0].chat_id).toBe('111');
    expect(calls[0][0].text).toMatch(/EMERGENCIA/);
    expect(calls[0][0].text).toMatch(/Fire on 5th/);
    expect(calls[0][0].text).toMatch(/Detalle: http:\/\/app\.test\/incidents\/inc-1/);
    expect(calls[1][0].chat_id).toBe('222');
  });
});
