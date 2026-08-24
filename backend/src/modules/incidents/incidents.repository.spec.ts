import { DataSource } from 'typeorm';
import { IncidentsRepository , unwrapReturningRows} from './incidents.repository';
import { SubjectScope } from '../../common/authz/subject-scope';

const GLOBAL_SCOPE: SubjectScope = { kind: 'global' };

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
        organizationId: 'org-1',
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
        'org-1',
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
        organizationId: null,
      });

      expect(result).toEqual(row);
    });
  });

  describe('findAll', () => {
    it('filters by zoneId and status when provided (scope required, D3)', async () => {
      dataSource.query.mockResolvedValue([]);

      await repository.findAll({ zoneId: 'zone-1', status: 'pending' }, GLOBAL_SCOPE);

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('zone_id = $1');
      expect(sql).toContain('status = $2');
      expect(params).toEqual(['zone-1', 'pending']);
    });

    it('has no WHERE beyond the scope fragment when no filters are given', async () => {
      dataSource.query.mockResolvedValue([]);

      await repository.findAll({}, GLOBAL_SCOPE);

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('WHERE TRUE');
      expect(params).toEqual([]);
    });

    it('applies the scope fragment (org scope filters by organization_id)', async () => {
      dataSource.query.mockResolvedValue([]);

      await repository.findAll({}, { kind: 'org', organizationId: 'org-1' });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('organization_id = $1');
      expect(params).toEqual(['org-1']);
    });
  });

  describe('findOne', () => {
    it('returns null when no row matches', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.findOne('missing', GLOBAL_SCOPE);

      expect(result).toBeNull();
    });

    it('applies the scope fragment alongside the id filter', async () => {
      dataSource.query.mockResolvedValue([]);

      await repository.findOne('inc-1', { kind: 'org', organizationId: 'org-1' });

      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('WHERE id = $1 AND organization_id = $2');
      expect(params).toEqual(['inc-1', 'org-1']);
    });
  });

  describe('updateStatus', () => {
    // The driver returns [rows, rowCount] for UPDATE — mocking bare rows here
    // is what let the tuple bug reach production with a green suite.
    it('returns the updated row from the [rows, count] tuple the driver really returns', async () => {
      const row = { id: 'inc-1', status: 'in_progress', zone_id: 'z-1' };
      dataSource.query.mockResolvedValue([[row], 1]);

      const result = await repository.updateStatus('inc-1', 'in_progress');

      const [, params] = dataSource.query.mock.calls[0];
      // T6.3: third param is a boolean flag (status === 'resolved') driving
      // resolution_date — avoids PostgreSQL "inconsistent types for $2" from
      // reusing the enum-bound status param inside a text CASE comparison.
      expect(params).toEqual(['inc-1', 'in_progress', false]);
      expect(result).toEqual(row);
    });

    // zone_id drives cache purging and realtime room routing; if the row is
    // array-wrapped both silently no-op.
    it('exposes zone_id on the returned row', async () => {
      dataSource.query.mockResolvedValue([[{ id: 'inc-1', zone_id: 'z-1' }], 1]);

      const result = await repository.updateStatus('inc-1', 'in_progress');

      expect(result?.zone_id).toBe('z-1');
    });

    it('returns null when no row matched', async () => {
      dataSource.query.mockResolvedValue([[], 0]);

      await expect(repository.updateStatus('ghost', 'resolved')).resolves.toBeNull();
    });
  });
});

describe('unwrapReturningRows', () => {
  // TypeORM's Postgres driver returns [rows, rowCount] for UPDATE/DELETE but
  // bare rows for INSERT/SELECT. Assuming one shape corrupts the other.
  it('unwraps the [rows, count] tuple that UPDATE and DELETE return', () => {
    const row = { id: 'i-1', zone_id: 'z-1' };

    expect(unwrapReturningRows([[row], 1])).toEqual([row]);
  });

  it('passes through the bare row array that INSERT and SELECT return', () => {
    const row = { id: 'i-1', zone_id: 'z-1' };

    expect(unwrapReturningRows([row])).toEqual([row]);
  });

  it('yields the row itself, never a nested array', () => {
    const row = { id: 'i-1', zone_id: 'z-1' };

    expect(unwrapReturningRows<typeof row>([[row], 1])[0]).toEqual(row);
    expect(Array.isArray(unwrapReturningRows([[row], 1])[0])).toBe(false);
  });

  it('returns an empty list when nothing matched', () => {
    expect(unwrapReturningRows([[], 0])).toEqual([]);
    expect(unwrapReturningRows([])).toEqual([]);
    expect(unwrapReturningRows(undefined)).toEqual([]);
  });
});
