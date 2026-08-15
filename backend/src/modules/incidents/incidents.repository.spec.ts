import { DataSource } from 'typeorm';
import { IncidentsRepository } from './incidents.repository';

describe('IncidentsRepository', () => {
  let dataSource: { query: jest.Mock };
  let repository: IncidentsRepository;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    repository = new IncidentsRepository(dataSource as unknown as DataSource);
  });

  describe('create', () => {
    it('inserts with ST_Point(lng, lat) argument order and parameterized SQL', async () => {
      dataSource.query.mockResolvedValue([{ id: 'inc-1' }]);

      await repository.create({
        title: 'Pothole',
        description: null,
        lat: -2.2,
        lng: -80.8,
        priority: 'medium',
        citizenId: 'user-1',
        zoneId: 'zone-1',
        geofenceMatched: true,
      });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('ST_Point($3, $4)');
      expect(sql).not.toContain('-80.8');
      expect(sql).not.toContain('-2.2');
      expect(params).toEqual([
        'Pothole',
        null,
        -80.8, // lng first
        -2.2, // lat second
        'medium',
        'user-1',
        'zone-1',
        true,
      ]);
    });

    it('returns the inserted row', async () => {
      const row = { id: 'inc-1', title: 'Pothole' };
      dataSource.query.mockResolvedValue([row]);

      const result = await repository.create({
        title: 'Pothole',
        description: null,
        lat: -2.2,
        lng: -80.8,
        priority: 'medium',
        citizenId: 'user-1',
        zoneId: null,
        geofenceMatched: false,
      });

      expect(result).toEqual(row);
    });
  });

  describe('findAll', () => {
    it('filters by zoneId and status when provided', async () => {
      dataSource.query.mockResolvedValue([]);

      await repository.findAll({ zoneId: 'zone-1', status: 'pending' });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('zone_id = $1');
      expect(sql).toContain('status = $2');
      expect(params).toEqual(['zone-1', 'pending']);
    });

    it('has no WHERE clause when no filters are given', async () => {
      dataSource.query.mockResolvedValue([]);

      await repository.findAll();

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).not.toContain('WHERE');
      expect(params).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns null when no row matches', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findOne('missing');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('updates status and returns the updated row', async () => {
      dataSource.query.mockResolvedValue([{ id: 'inc-1', status: 'in_progress' }]);

      const result = await repository.updateStatus('inc-1', 'in_progress');

      const [, params] = dataSource.query.mock.calls[0];
      expect(params).toEqual(['inc-1', 'in_progress']);
      expect(result).toEqual({ id: 'inc-1', status: 'in_progress' });
    });
  });
});
