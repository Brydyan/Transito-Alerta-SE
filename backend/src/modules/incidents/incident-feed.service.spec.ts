import { DataSource } from 'typeorm';
import { IncidentFeedService } from './incident-feed.service';
import { AuthContext } from '../../common/authz/subject-scope';

type MockCache = { get: jest.Mock; set: jest.Mock };
type Filters = { bbox?: string; status?: string; priority?: string; location_id?: string; per_page?: number; page?: number; incident_category_id?: string; zoom?: number };

const ORG_OPERATOR: AuthContext = {
  userId: 'op-1',
  roleName: 'operador_organizacion',
  organizationId: 'org-1',
  permissions: ['READ incidents'],
  scope: { kind: 'org', organizationId: 'org-1' },
  sessionId: null,
  isAnonymous: false,
};

function makeRow(id = 'inc-1') {
  return {
    id, category_id: null, organization_id: 'org-1', citizen_id: 'user-1',
    zone_id: null, title: 'Test', status: 'pending', priority: 'medium',
    updated_at: new Date(), created_at: new Date(), location_geojson: null,
    category_name: null, org_name: 'Org', user_first: 'Ana', user_last: 'B', zone_name: null,
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
});
