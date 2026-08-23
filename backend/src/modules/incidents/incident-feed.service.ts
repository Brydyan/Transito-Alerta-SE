import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DataSource } from 'typeorm';
import { AuthContext } from '../../common/authz/subject-scope';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedItemDto, FeedResponseDto } from './dto/stats-response.dto';

const STAFF_ROLES = ['admin_sistema', 'admin_organizacion', 'operador_organizacion', 'operador_sistema'];
const CITIZEN_FEED_KEY = 'feed:incidents';
const CITIZEN_MAX_PAGE = 50;
const STAFF_BBOX_CAP = 500;

@Injectable()
export class IncidentFeedService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  isStaffRole(user: AuthContext): boolean {
    return STAFF_ROLES.includes(user.roleName ?? '');
  }

  async getStaffFeed(query: FeedQueryDto, user: AuthContext): Promise<FeedResponseDto> {
    const page = query.page ?? 1;
    const perPage = Math.min(query.per_page ?? 20, query.bbox ? STAFF_BBOX_CAP : 500);
    const offset = (page - 1) * perPage;

    const params: unknown[] = [];

    const conditions: string[] = ['1=1'];

    // Org scope
    if (user.roleName !== 'admin_sistema' && user.organizationId) {
      params.push(user.organizationId);
      conditions.push(`i.organization_id = $${params.length}`);
    } else if (user.roleName !== 'admin_sistema') {
      conditions.push('1=0');
    }

    if (query.status) {
      params.push(query.status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (query.priority) {
      params.push(query.priority);
      conditions.push(`i.priority = $${params.length}`);
    }
    if (query.location_id) {
      params.push(query.location_id);
      conditions.push(`i.zone_id = $${params.length}`);
    }
    if (query.incident_category_id) {
      params.push(query.incident_category_id);
      conditions.push(`i.category_id = $${params.length}`);
    }
    if (query.bbox) {
      const parts = query.bbox.split(',').map(Number);
      if (parts.length === 4) {
        params.push(parts[0], parts[1], parts[2], parts[3]);
        const b = params.length;
        conditions.push(`ST_Within(i.location, ST_MakeEnvelope($${b - 3}, $${b - 2}, $${b - 1}, $${b}, 4326))`);
      }
    }

    const where = conditions.join(' AND ');

    params.push(perPage);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

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
      location_geojson: object | null;
      category_name: string | null;
      org_name: string | null;
      user_first: string | null;
      user_last: string | null;
      zone_name: string | null;
    }[]>(
      `SELECT i.id, i.category_id, i.organization_id, i.citizen_id, i.zone_id,
              i.title, i.status, i.priority, i.updated_at, i.created_at,
              ST_AsGeoJSON(i.location)::json AS location_geojson,
              ic.name AS category_name,
              o.name AS org_name,
              u.first_name AS user_first, u.last_name AS user_last,
              gz.name AS zone_name
       FROM incidents i
       LEFT JOIN incident_categories ic ON i.category_id = ic.id
       LEFT JOIN organizations o ON i.organization_id = o.id
       LEFT JOIN users u ON i.citizen_id = u.id
       LEFT JOIN geo_zones gz ON i.zone_id = gz.id
       WHERE ${where}
       ORDER BY i.updated_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    const countParams = params.slice(0, limitIdx - 1);
    const [countRow] = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM incidents i
       LEFT JOIN incident_categories ic ON i.category_id = ic.id
       WHERE ${where}`,
      countParams,
    );

    const total = Number(countRow.count);
    const data: FeedItemDto[] = rows.map((r) => ({
      id: r.id,
      incident_category_id: r.category_id,
      organization_id: r.organization_id,
      user_id: r.citizen_id,
      location_id: r.zone_id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      resolution_date: r.status === 'resolved' ? r.updated_at : null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      geom: r.location_geojson ?? null,
      category: r.category_id ? { id: r.category_id, name: r.category_name ?? '' } : null,
      organization: r.organization_id ? { id: r.organization_id, name: r.org_name ?? '' } : null,
      user: { id: r.citizen_id, name: [r.user_first, r.user_last].filter(Boolean).join(' ') || undefined },
      location: r.zone_id ? { id: r.zone_id, name: r.zone_name ?? '' } : null,
    }));

    return {
      data,
      meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) },
    };
  }

  async getCitizenFeed(query: FeedQueryDto): Promise<FeedResponseDto> {
    const page = query.page ?? 1;
    const perPage = Math.min(query.per_page ?? 20, CITIZEN_MAX_PAGE);

    const cached = await this.cache.get<FeedItemDto[]>(CITIZEN_FEED_KEY);

    if (cached) {
      let items = cached;
      if (query.status) items = items.filter((i) => i.status === query.status);
      if (query.location_id) items = items.filter((i) => i.location_id === query.location_id);
      const total = items.length;
      const start = (page - 1) * perPage;
      return {
        data: items.slice(start, start + perPage),
        meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) },
      };
    }

    // Fallback to Postgres (cold start / cache miss)
    const params: unknown[] = [];
    const conditions: string[] = ['1=1'];
    if (query.status) { params.push(query.status); conditions.push(`i.status = $${params.length}`); }
    if (query.location_id) { params.push(query.location_id); conditions.push(`i.zone_id = $${params.length}`); }

    params.push(perPage);
    const limitIdx = params.length;
    params.push((page - 1) * perPage);
    const offsetIdx = params.length;

    const rows = await this.dataSource.query<{
      id: string; category_id: string | null; organization_id: string | null;
      citizen_id: string; zone_id: string | null; title: string; status: string;
      priority: string; updated_at: Date; created_at: Date;
      location_geojson: object | null; category_name: string | null; org_name: string | null;
      zone_name: string | null;
    }[]>(
      `SELECT i.id, i.category_id, i.organization_id, i.citizen_id, i.zone_id,
              i.title, i.status, i.priority, i.updated_at, i.created_at,
              ST_AsGeoJSON(i.location)::json AS location_geojson,
              ic.name AS category_name, o.name AS org_name, gz.name AS zone_name
       FROM incidents i
       LEFT JOIN incident_categories ic ON i.category_id = ic.id
       LEFT JOIN organizations o ON i.organization_id = o.id
       LEFT JOIN geo_zones gz ON i.zone_id = gz.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY i.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    const countParams = params.slice(0, limitIdx - 1);
    const [countRow] = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM incidents i WHERE ${conditions.join(' AND ')}`,
      countParams,
    );
    const total = Number(countRow.count);

    const data: FeedItemDto[] = rows.map((r) => ({
      id: r.id,
      incident_category_id: r.category_id,
      organization_id: r.organization_id,
      user_id: r.citizen_id,
      location_id: r.zone_id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      resolution_date: r.status === 'resolved' ? r.updated_at : null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      geom: r.location_geojson ?? null,
      category: r.category_id ? { id: r.category_id, name: r.category_name ?? '' } : null,
      organization: r.organization_id ? { id: r.organization_id, name: r.org_name ?? '' } : null,
      user: { id: r.citizen_id },
      location: r.zone_id ? { id: r.zone_id, name: r.zone_name ?? '' } : null,
    }));

    return {
      data,
      meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) },
    };
  }
}
