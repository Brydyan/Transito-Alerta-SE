import type { DataSource, Repository } from 'typeorm';

import { StatusHistoryEntity } from './entities/status-history.entity';
import { StatusHistoryRepository } from './status-history.repository';

describe('StatusHistoryRepository', () => {
  let dataSource: { query: jest.Mock };
  let ormRepo: { find: jest.Mock };
  let repository: StatusHistoryRepository;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    ormRepo = { find: jest.fn() };
    repository = new StatusHistoryRepository(
      dataSource as unknown as DataSource,
      ormRepo as unknown as Repository<StatusHistoryEntity>,
    );
  });

  it('exposes no update or delete methods — append-only by construction (D7)', () => {
    expect((repository as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((repository as unknown as Record<string, unknown>).delete).toBeUndefined();
    expect((repository as unknown as Record<string, unknown>).remove).toBeUndefined();
    expect((repository as unknown as Record<string, unknown>).save).toBeUndefined();
  });

  describe('insert', () => {
    const data = {
      incidentId: 'incident-1',
      changedByUserId: 'user-1',
      previousStatus: 'pending',
      newStatus: 'in_progress',
      eventId: '1699999999999-0',
    };

    it('inserts via raw query with ON CONFLICT (event_id) DO NOTHING RETURNING id', async () => {
      dataSource.query.mockResolvedValue([{ id: 'row-1' }]);

      const result = await repository.insert(data);

      expect(dataSource.query).toHaveBeenCalledTimes(1);
      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO status_history/i);
      expect(sql).toMatch(/ON CONFLICT \(event_id\) DO NOTHING/i);
      expect(sql).toMatch(/RETURNING id/i);
      expect(params).toEqual([
        data.incidentId,
        data.changedByUserId,
        data.previousStatus,
        data.newStatus,
        data.eventId,
      ]);
      expect(result).toEqual([{ id: 'row-1' }]);
    });

    it('returns an empty array when the insert conflicts (already recorded)', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.insert(data);

      expect(result).toEqual([]);
    });
  });

  describe('findByIncident', () => {
    // 2026-10-06-incident-images-read-path (D6) — switched from
    // TypeORM `ormRepo.find` to a raw `dataSource.query` so we can
    // LEFT JOIN `users` to resolve `changed_by_name` server-side
    // (avoids N+1 HTTP). The SQL still orders `created_at ASC,
    // id ASC` to preserve the existing timeline ordering.
    it('queries with LEFT JOIN users and ordering by created_at ASC, id ASC', async () => {
      const rows = [
        {
          id: 'a',
          incident_id: 'incident-1',
          changed_by_user_id: 'user-1',
          previous_status: 'pending',
          new_status: 'in_progress',
          notes: null,
          event_id: '1',
          created_at: new Date(),
          changed_by_name: 'Ana López',
        },
      ];
      dataSource.query.mockResolvedValue(rows);

      const result = await repository.findByIncident('incident-1');

      expect(dataSource.query).toHaveBeenCalledTimes(1);
      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toMatch(/FROM status_history/i);
      expect(sql).toMatch(/LEFT JOIN users u ON u\.id = status_history\.changed_by_user_id/i);
      expect(sql).toMatch(/CONCAT\(u\.first_name, ' ', u\.last_name\) AS changed_by_name/i);
      expect(sql).toMatch(/ORDER BY status_history\.created_at ASC, status_history\.id ASC/i);
      expect(sql).toMatch(/WHERE status_history\.incident_id = \$1/i);
      expect(params).toEqual(['incident-1']);
      expect(result).toEqual(rows);
      // Confirms we no longer use the TypeORM repository — the
      // LEFT JOIN lives in raw SQL.
      expect(ormRepo.find).not.toHaveBeenCalled();
    });

    it('returns changed_by_name as null when the user row was deleted (LEFT JOIN semantics)', async () => {
      // The LEFT JOIN keeps the row when the actor's `users` row is
      // gone (GDPR soft-delete). CONCAT returns null because the
      // user columns are null; the frontend then surfaces 'sistema'.
      dataSource.query.mockResolvedValue([
        {
          id: 'a',
          incident_id: 'incident-1',
          changed_by_user_id: 'user-gone',
          previous_status: 'pending',
          new_status: 'in_progress',
          notes: null,
          event_id: '1',
          created_at: new Date(),
          changed_by_name: null,
        },
      ]);

      const result = await repository.findByIncident('incident-1');
      expect(result[0].changed_by_name).toBeNull();
    });

    it('returns changed_by_name as null when changed_by_user_id is null (system event)', async () => {
      dataSource.query.mockResolvedValue([
        {
          id: 'a',
          incident_id: 'incident-1',
          changed_by_user_id: null,
          previous_status: null,
          new_status: 'pending',
          notes: 'auto-creates from incident creation',
          event_id: '1',
          created_at: new Date(),
          changed_by_name: null,
        },
      ]);

      const result = await repository.findByIncident('incident-1');
      expect(result[0].changed_by_name).toBeNull();
    });
  });
});
