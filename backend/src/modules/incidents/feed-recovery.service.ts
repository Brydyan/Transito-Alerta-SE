import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DataSource } from 'typeorm';
import { FeedItemDto } from './dto/stats-response.dto';

export const CITIZEN_FEED_KEY = 'feed:incidents';

/**
 * FeedRecoveryService (T6.7.C) — rebuilds the citizen feed Redis cache from
 * Postgres. Runs automatically at 3 AM daily and can be triggered manually
 * via POST /admin/feed/rebuild.
 */
@Injectable()
export class FeedRecoveryService {
  private readonly logger = new Logger(FeedRecoveryService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Reads the `limit` most recent non-deleted incidents from Postgres and
   * repopulates the citizen feed Redis cache key. Returns the count of items
   * written to the cache.
   */
  async rebuildFeed(limit = 200): Promise<number> {
    this.logger.log(`[FeedRecovery] Starting rebuild with limit=${limit}`);

    // 1. Purge stale feed key
    await this.cache.del(CITIZEN_FEED_KEY);

    // 2. Query most recent incidents (no org filter, no status filter)
    const rows = await this.dataSource.query<{
      id: string;
      category_id: string | null;
      organization_id: string | null;
      citizen_id: string;
      zone_id: string | null;
      title: string;
      status: string;
      priority: string;
      updated_at: Date;
      created_at: Date;
      resolution_date: Date | null;
      location_geojson: object | null;
      category_name: string | null;
      org_name: string | null;
      zone_name: string | null;
    }[]>(
      `SELECT i.id, i.category_id, i.organization_id, i.citizen_id, i.zone_id,
              i.title, i.status, i.priority, i.updated_at, i.created_at, i.resolution_date,
              ST_AsGeoJSON(i.location)::json AS location_geojson,
              ic.name AS category_name, o.name AS org_name, gz.name AS zone_name
       FROM incidents i
       LEFT JOIN incident_categories ic ON i.category_id = ic.id
       LEFT JOIN organizations o ON i.organization_id = o.id
       LEFT JOIN geo_zones gz ON i.zone_id = gz.id
       WHERE i.deleted_at IS NULL
       ORDER BY i.created_at DESC
       LIMIT $1`,
      [limit],
    );

    // 3. Map to FeedItemDto format (same mapping as IncidentFeedService)
    const items: FeedItemDto[] = rows.map((r) => ({
      id: r.id,
      incident_category_id: r.category_id,
      organization_id: r.organization_id,
      user_id: r.citizen_id,
      location_id: r.zone_id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      resolution_date: r.resolution_date ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      geom: r.location_geojson ?? null,
      category: r.category_id ? { id: r.category_id, name: r.category_name ?? '' } : null,
      organization: r.organization_id ? { id: r.organization_id, name: r.org_name ?? '' } : null,
      user: { id: r.citizen_id },
      location: r.zone_id ? { id: r.zone_id, name: r.zone_name ?? '' } : null,
    }));

    // 4. Write to Redis (TTL: 1 hour)
    await this.cache.set(CITIZEN_FEED_KEY, items, 3600000);

    this.logger.log(`[FeedRecovery] Rebuilt feed with ${items.length} items`);
    return items.length;
  }

  /**
   * Scheduled cron: runs at 3 AM daily (server local time).
   */
  @Cron('0 3 * * *')
  async scheduledRebuild(): Promise<void> {
    this.logger.log('[FeedRecovery] Cron triggered');
    await this.rebuildFeed();
  }
}
