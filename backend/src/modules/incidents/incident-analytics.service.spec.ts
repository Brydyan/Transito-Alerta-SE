import { UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IncidentAnalyticsService } from './incident-analytics.service';
import { AuthContext } from '../../common/authz/subject-scope';

type MockCache = { get: jest.Mock; set: jest.Mock };

const SYSTEM_ADMIN: AuthContext = {
  userId: 'admin-1',
  roleName: 'master',
  organizationId: null,
  permissions: ['READ dashboard'],
  scope: { kind: 'global' },
  sessionId: null,
  isAnonymous: false,
};

const ORG_ADMIN: AuthContext = {
  userId: 'org-admin-1',
  roleName: 'admin_org',
  organizationId: 'org-uuid-1',
  permissions: ['READ dashboard'],
  scope: { kind: 'org', organizationId: 'org-uuid-1' },
  sessionId: null,
  isAnonymous: false,
};

const STATS_QUERY = {};

function mockTotalsQuery(ds: { query: jest.Mock }) {
  ds.query
    .mockResolvedValueOnce([{ total: '10', recent_count: '3', locations_count: '2', avg_seconds: '3600' }])
    .mockResolvedValueOnce([{ status: 'pending', cnt: '5' }, { status: 'in_progress', cnt: '3' }, { status: 'resolved', cnt: '2' }])
    .mockResolvedValueOnce([{ priority: 'medium', cnt: '10' }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{
      curr_total: '10', curr_pending: '5', curr_resolved: '2',
      prev_total: '8', prev_pending: '4', prev_resolved: '1',
    }]);
}

describe('IncidentAnalyticsService', () => {
  let ds: { query: jest.Mock };
  let cache: MockCache;
  let service: IncidentAnalyticsService;

  beforeEach(() => {
    ds = { query: jest.fn() };
    cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) };
    service = new IncidentAnalyticsService(
      ds as unknown as DataSource,
      cache as unknown as never,
    );
  });

  describe('getStats — org scoping', () => {
    it('system admin: no org clause in SQL', async () => {
      mockTotalsQuery(ds);
      await service.getStats(STATS_QUERY, SYSTEM_ADMIN);
      const firstSql = (ds.query.mock.calls[0] as [string, unknown[]])[0];
      expect(firstSql).not.toContain('organization_id');
    });

    it('org admin: org clause in SQL', async () => {
      mockTotalsQuery(ds);
      await service.getStats(STATS_QUERY, ORG_ADMIN);
      const firstSql = (ds.query.mock.calls[0] as [string, unknown[]])[0];
      expect(firstSql).toContain('organization_id');
    });
  });

  describe('getStats — zero-fill', () => {
    it('by_status always has pending, in_progress, resolved, closed', async () => {
      ds.query
        .mockResolvedValueOnce([{ total: '0', recent_count: '0', locations_count: '0', avg_seconds: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ curr_total: '0', curr_pending: '0', curr_resolved: '0', prev_total: '0', prev_pending: '0', prev_resolved: '0' }]);

      const result = await service.getStats(STATS_QUERY, SYSTEM_ADMIN);

      expect(result.by_status).toMatchObject({ pending: 0, in_progress: 0, resolved: 0, closed: 0 });
      expect(result.by_priority).toMatchObject({ low: 0, medium: 0, high: 0, critical: 0 });
    });
  });

  describe('getStats — trends', () => {
    it('positive total_pct when current > previous', async () => {
      ds.query
        .mockResolvedValueOnce([{ total: '10', recent_count: '3', locations_count: '2', avg_seconds: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ curr_total: '10', curr_pending: '5', curr_resolved: '2', prev_total: '5', prev_pending: '3', prev_resolved: '1' }]);

      const result = await service.getStats(STATS_QUERY, SYSTEM_ADMIN);
      expect(result.trends.total_pct).toBeGreaterThan(0);
    });
  });

  describe('getStats — cache', () => {
    it('cache hit: returns cached value without DB query', async () => {
      const cached = { total: 99 } as never;
      cache.get.mockResolvedValue(cached);

      const result = await service.getStats(STATS_QUERY, SYSTEM_ADMIN);

      expect(result).toBe(cached);
      expect(ds.query).not.toHaveBeenCalled();
    });
  });

  describe('getWeeklyStats', () => {
    it('default window: returns 10 entries', async () => {
      ds.query.mockResolvedValue([]);
      const result = await service.getWeeklyStats({}, SYSTEM_ADMIN);
      expect(result.days).toHaveLength(10);
    });

    it('zero-fill: missing days have recibidas 0 and resueltas 0', async () => {
      ds.query.mockResolvedValue([]);
      const result = await service.getWeeklyStats({}, SYSTEM_ADMIN);
      expect(result.days.every((d) => d.recibidas === 0 && d.resueltas === 0)).toBe(true);
    });

    it('fin < inicio throws UnprocessableEntityException', async () => {
      await expect(
        service.getWeeklyStats({ inicio: '2026-08-10', fin: '2026-08-01' }, SYSTEM_ADMIN),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });
});
