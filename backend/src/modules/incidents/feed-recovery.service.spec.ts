import { DataSource } from 'typeorm';
import { FeedRecoveryService, CITIZEN_FEED_KEY } from './feed-recovery.service';

const makeRow = (id: string) => ({
  id,
  category_id: 'cat-1',
  organization_id: 'org-1',
  citizen_id: 'user-1',
  zone_id: null,
  title: `Incident ${id}`,
  status: 'open',
  priority: 'medium',
  updated_at: new Date('2025-01-01'),
  created_at: new Date('2025-01-01'),
  resolution_date: null,
  location_geojson: null,
  category_name: 'Cat',
  org_name: 'Org',
  zone_name: null,
});

describe('FeedRecoveryService', () => {
  let service: FeedRecoveryService;
  let ds: { query: jest.Mock };
  let cache: { del: jest.Mock; set: jest.Mock; get: jest.Mock };

  beforeEach(() => {
    ds = { query: jest.fn() };
    cache = { del: jest.fn(), set: jest.fn(), get: jest.fn() };
    // Direct instantiation mirrors the pattern used in incident-feed.service.spec.ts
    service = new FeedRecoveryService(ds as unknown as DataSource, cache as unknown as never);
  });

  describe('rebuildFeed()', () => {
    it('deletes the feed key, queries Postgres, writes to cache, returns count', async () => {
      const rows = [makeRow('inc-1'), makeRow('inc-2'), makeRow('inc-3')];
      ds.query.mockResolvedValue(rows);
      cache.del.mockResolvedValue(undefined);
      cache.set.mockResolvedValue(undefined);

      const count = await service.rebuildFeed(10);

      expect(cache.del).toHaveBeenCalledWith(CITIZEN_FEED_KEY);
      expect(ds.query).toHaveBeenCalledWith(expect.stringContaining('deleted_at IS NULL'), [10]);
      expect(cache.set).toHaveBeenCalledWith(CITIZEN_FEED_KEY, expect.any(Array), expect.any(Number));
      expect(count).toBe(3);
    });

    it('maps rows to FeedItemDto format', async () => {
      const rows = [makeRow('inc-1')];
      ds.query.mockResolvedValue(rows);
      cache.del.mockResolvedValue(undefined);
      cache.set.mockResolvedValue(undefined);

      await service.rebuildFeed(100);

      const [, items] = cache.set.mock.calls[0];
      expect(items[0]).toMatchObject({
        id: 'inc-1',
        incident_category_id: 'cat-1',
        organization_id: 'org-1',
        user_id: 'user-1',
        status: 'open',
        priority: 'medium',
      });
    });

    it('uses default limit 200 when not specified', async () => {
      ds.query.mockResolvedValue([]);
      cache.del.mockResolvedValue(undefined);
      cache.set.mockResolvedValue(undefined);

      await service.rebuildFeed();

      expect(ds.query).toHaveBeenCalledWith(expect.any(String), [200]);
    });

    it('returns 0 when no incidents found', async () => {
      ds.query.mockResolvedValue([]);
      cache.del.mockResolvedValue(undefined);
      cache.set.mockResolvedValue(undefined);

      const count = await service.rebuildFeed(100);
      expect(count).toBe(0);
    });
  });
});
