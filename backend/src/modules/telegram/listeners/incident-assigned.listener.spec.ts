import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { IncidentAssignedListener } from './incident-assigned.listener';
import { TelegramService } from '../telegram.service';

/**
 * F7 B.6 — only the ASSIGNED operator is notified, never a group
 * (D11). The operator without a chat_id is silently skipped
 * (the assignment itself is unaffected). The override reason
 * (D9/D11) is appended to the message text when present.
 */
describe('IncidentAssignedListener', () => {
  let dataSource: { query: jest.Mock };
  let telegram: { enqueue: jest.Mock };
  let configService: { get: jest.Mock };
  let listener: IncidentAssignedListener;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    telegram = { enqueue: jest.fn().mockResolvedValue('1-0') };
    configService = { get: jest.fn().mockReturnValue({ appBaseUrl: 'http://app.test' }) };
    listener = new IncidentAssignedListener(
      telegram as unknown as TelegramService,
      dataSource as unknown as DataSource,
      configService as unknown as ConfigService,
    );
  });

  it('skips silently when the operator has no telegram_chat_id (B.6 edge case)', async () => {
    dataSource.query.mockResolvedValue([{ telegram_chat_id: null }]);
    await listener.onIncidentAssigned({
      incidentId: 'inc-1',
      operatorId: 'op-1',
      title: 'Pothole',
    });
    expect(telegram.enqueue).not.toHaveBeenCalled();
  });

  it('skips when the operator row is missing (defensive)', async () => {
    dataSource.query.mockResolvedValue([]);
    await listener.onIncidentAssigned({
      incidentId: 'inc-1',
      operatorId: 'op-1',
      title: 'Pothole',
    });
    expect(telegram.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues a complete message with title, description, priority, location, and detail link', async () => {
    dataSource.query.mockResolvedValue([{ telegram_chat_id: 'op-chat' }]);

    await listener.onIncidentAssigned({
      incidentId: 'inc-1',
      operatorId: 'op-1',
      title: 'Pothole on 5th',
      description: 'Big one, blocking the lane',
      categoryName: 'road',
      priority: 'high',
      location: { lat: -2.1, lng: -79.9 },
    });

    expect(telegram.enqueue).toHaveBeenCalledTimes(1);
    const payload = telegram.enqueue.mock.calls[0][0];
    expect(payload.chat_id).toBe('op-chat');
    expect(payload.text).toMatch(/Pothole on 5th/);
    expect(payload.text).toMatch(/Big one, blocking the lane/);
    expect(payload.text).toMatch(/Prioridad: high/);
    expect(payload.text).toMatch(/https:\/\/maps\.google\.com/);
    expect(payload.text).toMatch(/Detalle: http:\/\/app\.test\/incidents\/inc-1/);
  });

  it('appends the cap-override reason when present (D9/D11)', async () => {
    dataSource.query.mockResolvedValue([{ telegram_chat_id: 'op-chat' }]);

    await listener.onIncidentAssigned({
      incidentId: 'inc-1',
      operatorId: 'op-1',
      title: 'Fire',
      capOverrideReason: 'all other operators at cap, you are the only one available',
    });

    const payload = telegram.enqueue.mock.calls[0][0];
    expect(payload.text).toMatch(/por encima del tope/);
    expect(payload.text).toMatch(/all other operators at cap/);
  });

  it('does NOT mention the cap-override when no reason is present', async () => {
    dataSource.query.mockResolvedValue([{ telegram_chat_id: 'op-chat' }]);

    await listener.onIncidentAssigned({
      incidentId: 'inc-1',
      operatorId: 'op-1',
      title: 'Pothole',
    });

    const payload = telegram.enqueue.mock.calls[0][0];
    expect(payload.text).not.toMatch(/por encima del tope/);
  });
});
