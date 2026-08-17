import type { DataSource, Repository } from 'typeorm';

import { StatusHistoryEntity } from '../../entities/status-history.entity';
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
    it('reads ordered by created_at ASC, id ASC', async () => {
      const rows = [{ id: 'a' }, { id: 'b' }];
      ormRepo.find.mockResolvedValue(rows);

      const result = await repository.findByIncident('incident-1');

      expect(ormRepo.find).toHaveBeenCalledWith({
        where: { incidentId: 'incident-1' },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      expect(result).toEqual(rows);
    });
  });
});
