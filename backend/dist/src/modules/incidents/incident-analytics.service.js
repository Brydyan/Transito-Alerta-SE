"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentAnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const cache_manager_1 = require("@nestjs/cache-manager");
const crypto_1 = require("crypto");
const typeorm_1 = require("typeorm");
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const CACHE_TTL_MS = 3600 * 1000;
let IncidentAnalyticsService = class IncidentAnalyticsService {
    constructor(dataSource, cache) {
        this.dataSource = dataSource;
        this.cache = cache;
    }
    buildOrgScope(user) {
        if (user.roleName === 'master')
            return 'system';
        if (user.organizationId)
            return `org:${user.organizationId}`;
        return `user:${user.userId}`;
    }
    buildOrgClause(user, alias, paramIdx) {
        if (user.roleName === 'master')
            return { clause: '', params: [] };
        if (user.organizationId) {
            return { clause: `AND ${alias}.organization_id = $${paramIdx}`, params: [user.organizationId] };
        }
        return { clause: 'AND 1 = 0', params: [] };
    }
    filterHash(filters) {
        const sorted = Object.fromEntries(Object.entries(filters)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)));
        return (0, crypto_1.createHash)('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16);
    }
    buildDateClause(query, alias, params) {
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
    formatResolutionTime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const secs = Math.floor(seconds % 3600);
        return { formatted: `${days}d ${hours}h`, days, hours, seconds: secs };
    }
    async getStats(query, user) {
        const orgScope = this.buildOrgScope(user);
        const cacheKey = `stats:${orgScope}:${this.filterHash(query)}`;
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const params = [];
        const { clause: orgClause, params: orgParams } = this.buildOrgClause(user, 'i', params.length + 1);
        params.push(...orgParams);
        const dateClause = this.buildDateClause(query, 'i', params);
        const baseWhere = `WHERE 1=1 ${orgClause}${dateClause}`;
        const [totals] = await this.dataSource.query(`SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN i.created_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END) AS recent_count,
         COUNT(DISTINCT i.zone_id) AS locations_count,
         AVG(CASE WHEN i.status = 'resolved' THEN EXTRACT(EPOCH FROM (i.updated_at - i.created_at)) END) AS avg_seconds
       FROM incidents i ${baseWhere}`, params);
        const statusRows = await this.dataSource.query(`SELECT i.status, COUNT(*) AS cnt FROM incidents i ${baseWhere} GROUP BY i.status`, params);
        const priorityRows = await this.dataSource.query(`SELECT i.priority, COUNT(*) AS cnt FROM incidents i ${baseWhere} GROUP BY i.priority`, params);
        const categoryRows = await this.dataSource.query(`SELECT ic.name,
              COUNT(*) AS total,
              SUM(CASE WHEN i.status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
              SUM(CASE WHEN i.status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM incidents i
       LEFT JOIN incident_categories ic ON i.category_id = ic.id ${baseWhere}
       GROUP BY ic.name
       ORDER BY total DESC
       LIMIT 5`, params);
        const trends = await this.computeTrends(query, user, params, orgClause, dateClause);
        const by_status = { pending: 0, in_progress: 0, resolved: 0, closed: 0 };
        for (const row of statusRows)
            by_status[row.status] = Number(row.cnt);
        const by_priority = { low: 0, medium: 0, high: 0, critical: 0 };
        for (const row of priorityRows)
            by_priority[row.priority] = Number(row.cnt);
        const top_categories = categoryRows.map((r) => ({
            name: r.name ?? '(sin categoría)',
            total: Number(r.total),
            resolved: Number(r.resolved),
            pending: Number(r.pending),
        }));
        const avgSec = totals.avg_seconds ? Number(totals.avg_seconds) : null;
        const result = {
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
    async computeTrends(query, user, _baseParams, orgClause, _dateClause) {
        const now = new Date();
        const currentEnd = query.fin ? new Date(query.fin) : now;
        const currentStart = query.inicio ? new Date(query.inicio) : new Date(now.getTime() - 30 * 86400 * 1000);
        const durationMs = currentEnd.getTime() - currentStart.getTime();
        const prevEnd = new Date(currentStart.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - durationMs);
        const params = [];
        if (user.organizationId && user.roleName !== 'master') {
            params.push(user.organizationId);
        }
        const base = user.roleName === 'master' ? 'WHERE 1=1' : `WHERE 1=1 ${orgClause}`;
        params.push(currentStart.toISOString(), currentEnd.toISOString());
        const csIdx = params.length - 1;
        params.push(prevStart.toISOString(), prevEnd.toISOString());
        const psIdx = params.length - 1;
        const [row] = await this.dataSource.query(`SELECT
         SUM(CASE WHEN i.created_at BETWEEN $${csIdx} AND $${csIdx + 1} THEN 1 ELSE 0 END) AS curr_total,
         SUM(CASE WHEN i.created_at BETWEEN $${csIdx} AND $${csIdx + 1} AND i.status='pending' THEN 1 ELSE 0 END) AS curr_pending,
         SUM(CASE WHEN i.created_at BETWEEN $${csIdx} AND $${csIdx + 1} AND i.status='resolved' THEN 1 ELSE 0 END) AS curr_resolved,
         SUM(CASE WHEN i.created_at BETWEEN $${psIdx} AND $${psIdx + 1} THEN 1 ELSE 0 END) AS prev_total,
         SUM(CASE WHEN i.created_at BETWEEN $${psIdx} AND $${psIdx + 1} AND i.status='pending' THEN 1 ELSE 0 END) AS prev_pending,
         SUM(CASE WHEN i.created_at BETWEEN $${psIdx} AND $${psIdx + 1} AND i.status='resolved' THEN 1 ELSE 0 END) AS prev_resolved
       FROM incidents i ${base}`, params);
        const pct = (curr, prev) => prev === 0 ? null : Math.round(((curr - prev) / prev) * 100 * 10) / 10;
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
    async getWeeklyStats(query, user) {
        if (query.inicio && query.fin && new Date(query.fin) < new Date(query.inicio)) {
            throw new common_1.UnprocessableEntityException('fin must be >= inicio');
        }
        const orgScope = this.buildOrgScope(user);
        const cacheKey = `weekly-stats:${orgScope}:${this.filterHash(query)}`;
        const cached = await this.cache.get(cacheKey);
        if (cached)
            return cached;
        const now = new Date();
        const endDate = query.fin ? new Date(query.fin) : now;
        const startDate = query.inicio
            ? new Date(query.inicio)
            : new Date(now.getTime() - 9 * 86400 * 1000);
        const params = [];
        const { clause: orgClause, params: orgParams } = this.buildOrgClause(user, 'i', params.length + 1);
        params.push(...orgParams);
        params.push(startDate.toISOString(), endDate.toISOString());
        const startIdx = params.length - 1;
        const receivedRows = await this.dataSource.query(`SELECT DATE(i.created_at) AS day, COUNT(*) AS cnt
       FROM incidents i
       WHERE i.created_at >= $${startIdx} AND i.created_at <= $${startIdx + 1} ${orgClause}
       GROUP BY DATE(i.created_at)`, params);
        const resolvedRows = await this.dataSource.query(`SELECT DATE(i.updated_at) AS day, COUNT(*) AS cnt
       FROM incidents i
       WHERE i.status = 'resolved'
         AND i.updated_at >= $${startIdx} AND i.updated_at <= $${startIdx + 1} ${orgClause}
       GROUP BY DATE(i.updated_at)`, params);
        const receivedMap = new Map();
        for (const r of receivedRows)
            receivedMap.set(r.day, Number(r.cnt));
        const resolvedMap = new Map();
        for (const r of resolvedRows)
            resolvedMap.set(r.day, Number(r.cnt));
        const days = [];
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
        const result = { days };
        await this.cache.set(cacheKey, result, CACHE_TTL_MS);
        return result;
    }
};
exports.IncidentAnalyticsService = IncidentAnalyticsService;
exports.IncidentAnalyticsService = IncidentAnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [typeorm_1.DataSource, Object])
], IncidentAnalyticsService);
//# sourceMappingURL=incident-analytics.service.js.map