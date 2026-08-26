import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { createHash } from 'crypto';
import type { Cache } from 'cache-manager';
import { DataSource } from 'typeorm';
import { AuthContext } from '../../common/authz/subject-scope';
import { StatsQueryDto } from './dto/stats-query.dto';
import { WeeklyStatsQueryDto } from './dto/weekly-stats-query.dto';
import {
  DayDataPoint,
  IncidentStatsResponseDto,
  ResolutionTime,
  TopCategory,
  Trends,
  WeeklyStatsResponseDto,
} from './dto/stats-response.dto';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const CACHE_TTL_MS = 3600 * 1000;

@Injectable()
export class IncidentAnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private buildOrgScope(user: AuthContext): string {
    if (user.roleName === 'master') return 'system';
    if (user.organizationId) return `org:${user.organizationId}`;
    return `user:${user.userId}`;
  }

  private buildOrgClause(user: AuthContext, alias: string, paramIdx: number): { clause: string; params: unknown[] } {
    if (user.roleName === 'master') return { clause: '', params: [] };
    if (user.organizationId) {
      return { clause: `AND ${alias}.organization_id = $${paramIdx}`, params: [user.organizationId] };
    }
    return { clause: 'AND 1 = 0', params: [] };
  }

  private filterHash(filters: object): string {
    const sorted = Object.fromEntries(
      Object.entries(filters)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    return createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16);
  }

  private buildDateClause(query: StatsQueryDto, alias: string, params: unknown[]): string {
    let clause = '';
    if (query.inicio) {
      params.push(query.inicio);
      clause += ` AND ${alias}.created_at >= $${params.length}`;
    }
    if (query.fin) {
      params.push(query.fin);
      clause += ` AND ${alias}.created_at <= $${params.length}`;
    }
    if (query.tipo_id) {
      params.push(query.tipo_id);
      clause += ` AND ${alias}.category_id = $${params.length}`;
    }
    return clause;
  }

  private formatResolutionTime(seconds: number): ResolutionTime {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const secs = Math.floor(seconds % 3600);
    return { formatted: `${days}d ${hours}h`, days, hours, seconds: secs };
  }

  async getStats(query: StatsQueryDto, user: AuthContext): Promise<IncidentStatsResponseDto> {
    const orgScope = this.buildOrgScope(user);
    const cacheKey = `stats:${orgScope}:${this.filterHash(query)}`;

    const cached = await this.cache.get<IncidentStatsResponseDto>(cacheKey);
    if (cached) return cached;

    const params: unknown[] = [];
    const { clause: orgClause, params: orgParams } = this.buildOrgClause(user, 'i', params.length + 1);
    params.push(...orgParams);
    const dateClause = this.buildDateClause(query, 'i', params);

    // Totals + by_status + by_priority + recent_count + locations_count + avg resolution
    const baseWhere = `WHERE 1=1 ${orgClause}${dateClause}`;
    const [totals] = await this.dataSource.query<{ total: string; recent_count: string; locations_count: string; avg_seconds: string | null }[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN i.created_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END) AS recent_count,
         COUNT(DISTINCT i.zone_id) AS locations_count,
         AVG(CASE WHEN i.status = 'resolved' THEN EXTRACT(EPOCH FROM (i.updated_at - i.created_at)) END) AS avg_seconds
       FROM incidents i ${baseWhere}`,
      params,
    );

    const statusRows = await this.dataSource.query<{ status: string; cnt: string }[]>(
      `SELECT i.status, COUNT(*) AS cnt FROM incidents i ${baseWhere} GROUP BY i.status`,
      params,
    );

    const priorityRows = await this.dataSource.query<{ priority: string; cnt: string }[]>(
      `SELECT i.priority, COUNT(*) AS cnt FROM incidents i ${baseWhere} GROUP BY i.priority`,
      params,
    );

    const categoryRows = await this.dataSource.query<{ name: string; total: string; resolved: string; pending: string }[]>(
      `SELECT ic.name,
              COUNT(*) AS total,
              SUM(CASE WHEN i.status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
              SUM(CASE WHEN i.status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM incidents i
       LEFT JOIN incident_categories ic ON i.category_id = ic.id ${baseWhere}
       GROUP BY ic.name
       ORDER BY total DESC
       LIMIT 5`,
      params,
    );

    // Trends: current period vs previous equal-length period
    const trends = await this.computeTrends(query, user, params, orgClause, dateClause);

    const by_status: Record<string, number> = { pending: 0, in_progress: 0, resolved: 0, closed: 0 };
    for (const row of statusRows) by_status[row.status] = Number(row.cnt);

    const by_priority: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const row of priorityRows) by_priority[row.priority] = Number(row.cnt);

    const top_categories: TopCategory[] = categoryRows.map((r) => ({
      name: r.name ?? '(sin categoría)',
      total: Number(r.total),
      resolved: Number(r.resolved),
      pending: Number(r.pending),
    }));

    const avgSec = totals.avg_seconds ? Number(totals.avg_seconds) : null;

    const result: IncidentStatsResponseDto = {
      total: Number(totals.total),
      by_status,
      by_priority,
      recent_count: Number(totals.recent_count),
      locations_count: Number(totals.locations_count),
      average_resolution_time: avgSec !== null ? this.formatResolutionTime(avgSec) : null,
      trends,
      top_categories,
    };

    await this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computeTrends(
    query: StatsQueryDto,
    user: AuthContext,
    _baseParams: unknown[],
    orgClause: string,
    _dateClause: string,
  ): Promise<Trends> {
    const now = new Date();
    const currentEnd = query.fin ? new Date(query.fin) : now;
    const currentStart = query.inicio ? new Date(query.inicio) : new Date(now.getTime() - 30 * 86400 * 1000);
    const durationMs = currentEnd.getTime() - currentStart.getTime();
    const prevEnd = new Date(currentStart.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);

    const params: unknown[] = [];
    if (user.organizationId && user.roleName !== 'master') {
      params.push(user.organizationId);
    }
    const base = user.roleName === 'master' ? 'WHERE 1=1' : `WHERE 1=1 ${orgClause}`;

    params.push(currentStart.toISOString(), currentEnd.toISOString());
    const csIdx = params.length - 1;
    params.push(prevStart.toISOString(), prevEnd.toISOString());
    const psIdx = params.length - 1;

    const [row] = await this.dataSource.query<{
      curr_total: string; curr_pending: string; curr_resolved: string;
      prev_total: string; prev_pending: string; prev_resolved: string;
    }[]>(
      `SELECT
         SUM(CASE WHEN i.created_at BETWEEN $${csIdx} AND $${csIdx + 1} THEN 1 ELSE 0 END) AS curr_total,
         SUM(CASE WHEN i.created_at BETWEEN $${csIdx} AND $${csIdx + 1} AND i.status='pending' THEN 1 ELSE 0 END) AS curr_pending,
         SUM(CASE WHEN i.created_at BETWEEN $${csIdx} AND $${csIdx + 1} AND i.status='resolved' THEN 1 ELSE 0 END) AS curr_resolved,
         SUM(CASE WHEN i.created_at BETWEEN $${psIdx} AND $${psIdx + 1} THEN 1 ELSE 0 END) AS prev_total,
         SUM(CASE WHEN i.created_at BETWEEN $${psIdx} AND $${psIdx + 1} AND i.status='pending' THEN 1 ELSE 0 END) AS prev_pending,
         SUM(CASE WHEN i.created_at BETWEEN $${psIdx} AND $${psIdx + 1} AND i.status='resolved' THEN 1 ELSE 0 END) AS prev_resolved
       FROM incidents i ${base}`,
      params,
    );

    const pct = (curr: number, prev: number): number | null =>
      prev === 0 ? null : Math.round(((curr - prev) / prev) * 100 * 10) / 10;

    const ct = Number(row.curr_total);
    const pt = Number(row.prev_total);
    const cp = Number(row.curr_pending);
    const pp = Number(row.prev_pending);
    const cr = Number(row.curr_resolved);
    const pr = Number(row.prev_resolved);

    const currRate = ct > 0 ? cr / ct : 0;
    const prevRate = pt > 0 ? pr / pt : 0;

    return {
      total_pct: pct(ct, pt),
      pendientes_pct: pct(cp, pp),
      resolution_rate_pct: prevRate === 0 ? null : Math.round((currRate - prevRate) * 100 * 10) / 10,
    };
  }

  async getWeeklyStats(query: WeeklyStatsQueryDto, user: AuthContext): Promise<WeeklyStatsResponseDto> {
    if (query.inicio && query.fin && new Date(query.fin) < new Date(query.inicio)) {
      throw new UnprocessableEntityException('fin must be >= inicio');
    }

    const orgScope = this.buildOrgScope(user);
    const cacheKey = `weekly-stats:${orgScope}:${this.filterHash(query)}`;

    const cached = await this.cache.get<WeeklyStatsResponseDto>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const endDate = query.fin ? new Date(query.fin) : now;
    const startDate = query.inicio
      ? new Date(query.inicio)
      : new Date(now.getTime() - 9 * 86400 * 1000);

    const params: unknown[] = [];
    const { clause: orgClause, params: orgParams } = this.buildOrgClause(user, 'i', params.length + 1);
    params.push(...orgParams);
    params.push(startDate.toISOString(), endDate.toISOString());
    const startIdx = params.length - 1;

    const receivedRows = await this.dataSource.query<{ day: string; cnt: string }[]>(
      `SELECT DATE(i.created_at) AS day, COUNT(*) AS cnt
       FROM incidents i
       WHERE i.created_at >= $${startIdx} AND i.created_at <= $${startIdx + 1} ${orgClause}
       GROUP BY DATE(i.created_at)`,
      params,
    );

    const resolvedRows = await this.dataSource.query<{ day: string; cnt: string }[]>(
      `SELECT DATE(i.updated_at) AS day, COUNT(*) AS cnt
       FROM incidents i
       WHERE i.status = 'resolved'
         AND i.updated_at >= $${startIdx} AND i.updated_at <= $${startIdx + 1} ${orgClause}
       GROUP BY DATE(i.updated_at)`,
      params,
    );

    const receivedMap = new Map<string, number>();
    for (const r of receivedRows) receivedMap.set(r.day, Number(r.cnt));
    const resolvedMap = new Map<string, number>();
    for (const r of resolvedRows) resolvedMap.set(r.day, Number(r.cnt));

    const days: DayDataPoint[] = [];
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      days.push({
        date: dateStr,
        label: DAY_LABELS[cursor.getDay()],
        recibidas: receivedMap.get(dateStr) ?? 0,
        resueltas: resolvedMap.get(dateStr) ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const result: WeeklyStatsResponseDto = { days };
    await this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }
}
