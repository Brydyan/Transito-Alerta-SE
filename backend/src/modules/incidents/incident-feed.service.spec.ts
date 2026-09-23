import { DataSource } from 'typeorm';
import { IncidentFeedService } from './incident-feed.service';
import { AuthContext } from '../../common/authz/subject-scope';

type MockCache = { get: jest.Mock; set: jest.Mock };
type Filters = { bbox?: string; status?: string; priority?: string; zone_id?: string; per_page?: number; page?: number; incident_category_id?: string; zoom?: number };

const ORG_OPERATOR: AuthContext = {
  userId: 'op-1',
  roleName: 'operador_org',
  organizationId: 'org-1',
  permissions: ['READ incidents'],
  scope: { kind: 'org', organizationId: 'org-1' },
  sessionId: null,
  isAnonymous: false,
};

function makeRow(id = 'inc-1', zone_id: string | null = null, status = 'pending') {
  return {
    id, category_id: null, organization_id: 'org-1', citizen_id: 'user-1',
    zone_id, title: 'Test', status, priority: 'medium',
    updated_at: new Date(), created_at: new Date(), location_geojson: null,
    category_name: null, org_name: 'Org', user_first: 'Ana', user_last: 'B', zone_name: null,
    resolution_date: null,
  };
}

describe('IncidentFeedService', () => {
  let ds: { query: jest.Mock };
  let cache: MockCache;
  let service: IncidentFeedService;

  beforeEach(() => {
    ds = { query: jest.fn() };
    cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
    service = new IncidentFeedService(ds as unknown as DataSource, cache as unknown as never);
  });

  describe('getStaffFeed', () => {
    it('returns org-scoped incidents for operator', async () => {
      ds.query.mockResolvedValueOnce([makeRow()]).mockResolvedValueOnce([{ count: '1' }]);

      const result = await service.getStaffFeed({} as Filters, ORG_OPERATOR);

      expect(result.data).toHaveLength(1);
      const sql = (ds.query.mock.calls[0] as [string, unknown[]])[0];
      expect(sql).toContain('organization_id');
    });

    it('bbox cap: LIMIT capped at 500', async () => {
      ds.query.mockResolvedValue([]).mockResolvedValue([{ count: '0' }]);

      await service.getStaffFeed({ bbox: '-70,-30,-68,-28', per_page: 600 } as Filters, ORG_OPERATOR);

      const params = (ds.query.mock.calls[0] as [string, unknown[]])[1];
      // perPage = min(600, 500) = 500; LIMIT param is second-to-last
      const limitParam = params[params.length - 2];
      expect(limitParam).toBe(500);
    });
  });

  describe('getCitizenFeed', () => {
    it('returns Redis data when cache hit', async () => {
      const entry = { id: 'r-1', status: 'pending', location_id: null };
      cache.get.mockResolvedValue([entry]);

      const result = await service.getCitizenFeed({ page: 1, per_page: 10 } as Filters);

      expect(result.data).toContain(entry);
      expect(ds.query).not.toHaveBeenCalled();
    });

    it('falls back to Postgres when Redis key absent', async () => {
      cache.get.mockResolvedValue(undefined);
      ds.query.mockResolvedValueOnce([makeRow()]).mockResolvedValueOnce([{ count: '1' }]);

      const result = await service.getCitizenFeed({ page: 1 } as Filters);

      expect(ds.query).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
    });
  });

  describe('Zone Hierarchy Filtering', () => {
    it('resolveZoneHierarchy: provincia returns self + canton + parroquia children', async () => {
      const zoneTree = [{ id: 'prov-1' }, { id: 'cant-1' }, { id: 'cant-2' }, { id: 'parr-1' }];
      ds.query.mockResolvedValue(zoneTree);

      const result = await (service as any).resolveZoneHierarchy('prov-1');

      expect(result).toEqual(['prov-1', 'cant-1', 'cant-2', 'parr-1']);
      expect(ds.query).toHaveBeenCalledWith(expect.stringContaining('WITH RECURSIVE zone_tree'), ['prov-1']);
    });

    it('getStaffFeed: zona_id=provincia filters incidents in provincia + descendants', async () => {
      const zoneTree = [{ id: 'prov-1' }, { id: 'cant-1' }, { id: 'parr-1' }];
      const inc1 = makeRow('inc-1', 'cant-1');
      const inc2 = makeRow('inc-2', 'parr-1');

      // First call: resolveZoneHierarchy
      // Second call: getStaffFeed SELECT
      // Third call: COUNT
      ds.query
        .mockResolvedValueOnce(zoneTree)
        .mockResolvedValueOnce([inc1, inc2])
        .mockResolvedValueOnce([{ count: '2' }]);

      const result = await service.getStaffFeed({ zone_id: 'prov-1' } as Filters, ORG_OPERATOR);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].location_id).toBe('cant-1');
      expect(result.data[1].location_id).toBe('parr-1');

      // Verify IN clause includes all zone IDs
      const selectCall = ds.query.mock.calls[1];
      const selectSql = selectCall[0] as string;
      expect(selectSql).toContain('i.zone_id IN');
    });

    it('getStaffFeed: zona_id not found returns empty', async () => {
      ds.query
        .mockResolvedValueOnce([]) // resolveZoneHierarchy empty
        .mockResolvedValueOnce([]) // SELECT (condition 1=0)
        .mockResolvedValueOnce([{ count: '0' }]); // COUNT

      const result = await service.getStaffFeed({ zone_id: 'unknown' } as Filters, ORG_OPERATOR);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('getCitizenFeed cached: filters by zone hierarchy from Redis data', async () => {
      const cached = [
        { id: 'inc-1', status: 'pending', location_id: 'cant-1' },
        { id: 'inc-2', status: 'pending', location_id: 'parr-1' },
        { id: 'inc-3', status: 'pending', location_id: 'other-zone' },
      ];
      cache.get.mockResolvedValue(cached);

      // Mock resolveZoneHierarchy to return prov-1 + descendants
      ds.query.mockResolvedValue([
        { id: 'prov-1' },
        { id: 'cant-1' },
        { id: 'parr-1' },
      ]);

      const result = await service.getCitizenFeed({ zone_id: 'prov-1', page: 1, per_page: 10 } as Filters);

      // Should include only inc-1 and inc-2 (location_id in zone tree)
      expect(result.data).toHaveLength(2);
      expect(result.data.map(d => d.id)).toEqual(['inc-1', 'inc-2']);
    });

    it('getCitizenFeed fallback: Postgres query filters by zone hierarchy', async () => {
      cache.get.mockResolvedValue(undefined);

      const inc1 = makeRow('inc-1', 'cant-1');
      const inc2 = makeRow('inc-2', 'parr-1');

      ds.query
        .mockResolvedValueOnce([{ id: 'prov-1' }, { id: 'cant-1' }, { id: 'parr-1' }]) // resolveZoneHierarchy
        .mockResolvedValueOnce([inc1, inc2]) // SELECT
        .mockResolvedValueOnce([{ count: '2' }]); // COUNT

      const result = await service.getCitizenFeed({ zone_id: 'prov-1', page: 1, per_page: 10 } as Filters);

      expect(result.data).toHaveLength(2);
      const selectSql = (ds.query.mock.calls[1] as [string, unknown[]])[0];
      expect(selectSql).toContain('i.zone_id IN');
    });

    it('getStaffFeed: combines zone + status filters', async () => {
      const zoneTree = [{ id: 'prov-1' }, { id: 'cant-1' }];
      const inc = makeRow('inc-1', 'cant-1', 'resolved');

      ds.query
        .mockResolvedValueOnce(zoneTree)
        .mockResolvedValueOnce([inc])
        .mockResolvedValueOnce([{ count: '1' }]);

      const result = await service.getStaffFeed(
        { zone_id: 'prov-1', status: 'resolved' } as Filters,
        ORG_OPERATOR
      );

      expect(result.data).toHaveLength(1);
      const selectSql = (ds.query.mock.calls[1] as [string, unknown[]])[0];
      expect(selectSql).toContain('i.zone_id IN');
      expect(selectSql).toContain('i.status');
    });
  });
});
