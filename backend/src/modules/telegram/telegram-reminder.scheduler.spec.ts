import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TelegramService } from './telegram.service';
import { TelegramReminderScheduler } from './telegram-reminder.scheduler';
import { TelegramConfig } from '../../config/telegram.config';

/**
 * F7 B.5 / D10 REVISED — repique cadence is now 25/40/60 minutes from
 * `created_at`, with the 3rd message going to `master` (not a
 * progressive escalation to master + operador_sistema). The cycle
 * counter `reminder_count` runs 0 → 1 → 2 → 3 and stops there.
 */
describe('TelegramReminderScheduler (Round 2 cadence)', () => {
  let dataSource: { query: jest.Mock };
  let telegram: { enqueue: jest.Mock };
  let configService: { get: jest.Mock };
  let scheduler: TelegramReminderScheduler;

  const cfg: TelegramConfig = {
    botToken: undefined,
    appBaseUrl: 'http://app.test',
    sweepIntervalMs: 10_000,
    claimIdleMs: 30_000,
    maxAttempts: 3,
    reminderIntervalMs: 25 * 60 * 1000,
    reminderStopAt: 3,
  };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    telegram = { enqueue: jest.fn().mockResolvedValue('1-0') };
    configService = { get: jest.fn().mockReturnValue(cfg) };
    scheduler = new TelegramReminderScheduler(
      dataSource as unknown as DataSource,
      telegram as unknown as TelegramService,
      configService as unknown as ConfigService,
    );
  });

  function nowMinus(min: number): string {
    return new Date(Date.now() - min * 60_000).toISOString();
  }

  it('does NOT touch incidents with reminder_count = 3 (already done)', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await scheduler.tick();
    expect(dataSource.query).toHaveBeenCalledTimes(1); // only the SELECT
    expect(telegram.enqueue).not.toHaveBeenCalled();
  });

  it('candidate filter is enforced at SQL level (created_at < NOW() - 25min)', async () => {
    // The actual filter lives in the SELECT — `created_at < NOW() - INTERVAL '25 minutes'`.
    // A real DB would not return incidents younger than 25 min. We assert
    // that the empty result triggers no enqueue.
    dataSource.query.mockResolvedValueOnce([]);
    await scheduler.tick();
    expect(telegram.enqueue).not.toHaveBeenCalled();
  });

  // F7 Round 3 S1 — explicit stop-condition tests. The spec scenarios
  // "Parada por asignación" and "Parada por cierre" are covered by the
  // SQL filter `status = 'pending'`; these tests make the intent
  // self-documenting in case a future refactor moves the filter out of
  // SQL.

  it('S1: does NOT enqueue when the SQL filter excludes an in_progress incident (Parada por asignación)', async () => {
    // Real DB: row would not appear in the candidate SELECT because
    // `status = 'in_progress'` ≠ `'pending'`. Mocking the SELECT to
    // return [] simulates that filter and proves the scheduler does
    // nothing.
    dataSource.query.mockResolvedValueOnce([]);
    await scheduler.tick();
    expect(telegram.enqueue).not.toHaveBeenCalled();
  });

  it('S1: does NOT enqueue when the SQL filter excludes a closed incident (Parada por cierre)', async () => {
    // Same as above for `status = 'closed'`. A critical incident
    // closed from pending (admin marked it as duplicate, etc.) must
    // not generate further pings.
    dataSource.query.mockResolvedValueOnce([]);
    await scheduler.tick();
    expect(telegram.enqueue).not.toHaveBeenCalled();
  });

  it('S1: the candidate SELECT structurally includes `status = \'pending\'` and the stop threshold', async () => {
    // Structural test — confirms the SQL filter the two stop-condition
    // tests rely on is actually present in the query. Catches refactors
    // that move the filter out of SQL without updating the tests.
    dataSource.query.mockResolvedValueOnce([]);
    await scheduler.tick();
    const sql = dataSource.query.mock.calls[0][0] as string;
    expect(sql).toMatch(/status\s*=\s*'pending'/);
    expect(sql).toMatch(/reminder_count\s*<\s*\$1/);
  });

  it('W2 regression: sends the 1st reminder even when elapsed > 40min (scheduler-outage scenario)', async () => {
    // Previously a `minutesSinceCreated < 40` guard caused a permanent
    // stall: count stayed 0, row stayed in SELECT, master was never
    // alerted. Guard removed — reminder_count is the sole progress tracker.
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 'inc-stall',
          title: 'Stall Fire',
          organization_id: 'org-A',
          reminder_count: 0,
          created_at: nowMinus(50), // elapsed > 40min
        },
      ])
      .mockResolvedValueOnce([{ telegram_chat_id: 'admin-1' }])
      .mockResolvedValueOnce(undefined);

    await scheduler.tick();

    expect(telegram.enqueue).toHaveBeenCalledTimes(1);
    expect(telegram.enqueue.mock.calls[0][0].text).toMatch(/recordatorio #1/);
    expect(dataSource.query.mock.calls[2][1]).toEqual(['inc-stall', 1]);
  });

  it('sends the 1st reminder to admin_org at T+25min and bumps count to 1', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 'inc-1',
          title: 'Fire',
          organization_id: 'org-A',
          reminder_count: 0,
          created_at: nowMinus(25),
        },
      ])
      .mockResolvedValueOnce([{ telegram_chat_id: 'admin-1' }]) // org admins
      .mockResolvedValueOnce(undefined); // UPDATE

    await scheduler.tick();

    expect(telegram.enqueue).toHaveBeenCalledTimes(1);
    const payload = telegram.enqueue.mock.calls[0][0];
    expect(payload.chat_id).toBe('admin-1');
    expect(payload.text).toMatch(/recordatorio #1/);
    expect(dataSource.query.mock.calls[2][1]).toEqual(['inc-1', 1]);
  });

  it('sends the 2nd reminder to admin_org at T+40min and bumps count to 2', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 'inc-1',
          title: 'Fire',
          organization_id: 'org-A',
          reminder_count: 1,
          created_at: nowMinus(40),
        },
      ])
      .mockResolvedValueOnce([{ telegram_chat_id: 'admin-1' }]) // org admins
      .mockResolvedValueOnce(undefined);

    await scheduler.tick();

    expect(telegram.enqueue).toHaveBeenCalledTimes(1);
    expect(telegram.enqueue.mock.calls[0][0].text).toMatch(/recordatorio #2/);
    expect(dataSource.query.mock.calls[2][1]).toEqual(['inc-1', 2]);
  });

  it('sends the final message to master (not admin_org) at T+60min and bumps count to 3', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 'inc-1',
          title: 'Fire',
          organization_id: 'org-A',
          reminder_count: 2,
          created_at: nowMinus(60),
        },
      ])
      .mockResolvedValueOnce([{ telegram_chat_id: 'master-1' }]) // master
      .mockResolvedValueOnce(undefined);

    await scheduler.tick();

    expect(telegram.enqueue).toHaveBeenCalledTimes(1);
    const payload = telegram.enqueue.mock.calls[0][0];
    expect(payload.chat_id).toBe('master-1');
    expect(payload.text).toMatch(/no asignada en 1h/);
    expect(dataSource.query.mock.calls[2][1]).toEqual(['inc-1', 3]);
  });

  it('does NOT enqueue at T+25min when there are no admin_org with telegram_chat_id', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 'inc-1',
          title: 'Fire',
          organization_id: 'org-A',
          reminder_count: 0,
          created_at: nowMinus(25),
        },
      ])
      .mockResolvedValueOnce([]); // no org admins with chat

    await scheduler.tick();

    expect(telegram.enqueue).not.toHaveBeenCalled();
    // No UPDATE issued (no message was sent).
    expect(dataSource.query).toHaveBeenCalledTimes(2);
  });
});
