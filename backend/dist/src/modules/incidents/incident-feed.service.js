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
exports.IncidentFeedService = void 0;
const common_1 = require("@nestjs/common");
const cache_manager_1 = require("@nestjs/cache-manager");
const typeorm_1 = require("typeorm");
const STAFF_ROLES = ['master', 'admin_org', 'operador_org', 'operador_sistema'];
const CITIZEN_FEED_KEY = 'feed:incidents';
const CITIZEN_MAX_PAGE = 50;
const STAFF_BBOX_CAP = 500;
let IncidentFeedService = class IncidentFeedService {
    constructor(dataSource, cache) {
        this.dataSource = dataSource;
        this.cache = cache;
    }
    isStaffRole(user) {
        return STAFF_ROLES.includes(user.roleName ?? '');
    }
    async resolveZoneHierarchy(zoneId) {
        const result = await this.dataSource.query(`WITH RECURSIVE zone_tree AS (
        SELECT id FROM geo_zones WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT gz.id FROM geo_zones gz
        INNER JOIN zone_tree zt ON gz.parent_id = zt.id
        WHERE gz.deleted_at IS NULL
      )
      SELECT id FROM zone_tree`, [zoneId]);
        return result.map(r => r.id);
    }
    async getStaffFeed(query, user) {
        const page = query.page ?? 1;
        const perPage = Math.min(query.per_page ?? 20, query.bbox ? STAFF_BBOX_CAP : 500);
        const offset = (page - 1) * perPage;
        const params = [];
        const conditions = ['1=1'];
        if (user.roleName !== 'master' && user.organizationId) {
            params.push(user.organizationId);
            conditions.push(`i.organization_id = $${params.length}`);
        }
        else if (user.roleName !== 'master') {
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
        if (query.zone_id) {
            const zoneIds = await this.resolveZoneHierarchy(query.zone_id);
            if (zoneIds.length > 0) {
                const placeholders = zoneIds.map((_, idx) => `$${params.length + idx + 1}`).join(',');
                params.push(...zoneIds);
                conditions.push(`i.zone_id IN (${placeholders})`);
            }
            else {
                conditions.push('1=0');
            }
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
        const rows = await this.dataSource.query(`SELECT i.id, i.category_id, i.organization_id, i.citizen_id, i.zone_id,
              i.title, i.status, i.priority, i.updated_at, i.created_at, i.resolution_date,
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
       WHERE ${where} AND i.deleted_at IS NULL
       ORDER BY i.updated_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`, params);
        const countParams = params.slice(0, limitIdx - 1);
        const [countRow] = await this.dataSource.query(`SELECT COUNT(*) AS count FROM incidents i
       LEFT JOIN incident_categories ic ON i.category_id = ic.id
       WHERE ${where}`, countParams);
        const total = Number(countRow.count);
        const data = rows.map((r) => ({
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
            user: { id: r.citizen_id, name: [r.user_first, r.user_last].filter(Boolean).join(' ') || undefined },
            location: r.zone_id ? { id: r.zone_id, name: r.zone_name ?? '' } : null,
        }));
        return {
            data,
            meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) },
        };
    }
    async getCitizenFeed(query) {
        const page = query.page ?? 1;
        const perPage = Math.min(query.per_page ?? 20, CITIZEN_MAX_PAGE);
        const cached = await this.cache.get(CITIZEN_FEED_KEY);
        if (cached) {
            let items = cached;
            if (query.status)
                items = items.filter((i) => i.status === query.status);
            if (query.zone_id) {
                const zoneIds = await this.resolveZoneHierarchy(query.zone_id);
                const zoneIdSet = new Set(zoneIds);
                items = items.filter((i) => i.location_id && zoneIdSet.has(i.location_id));
            }
            const total = items.length;
            const start = (page - 1) * perPage;
            return {
                data: items.slice(start, start + perPage),
                meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) },
            };
        }
        const params = [];
        const conditions = ['1=1'];
        if (query.status) {
            params.push(query.status);
            conditions.push(`i.status = $${params.length}`);
        }
        if (query.zone_id) {
            const zoneIds = await this.resolveZoneHierarchy(query.zone_id);
            if (zoneIds.length > 0) {
                const placeholders = zoneIds.map((_, idx) => `$${params.length + idx + 1}`).join(',');
                params.push(...zoneIds);
                conditions.push(`i.zone_id IN (${placeholders})`);
            }
            else {
                conditions.push('1=0');
            }
        }
        params.push(perPage);
        const limitIdx = params.length;
        params.push((page - 1) * perPage);
        const offsetIdx = params.length;
        conditions.push('i.deleted_at IS NULL');
        const rows = await this.dataSource.query(`SELECT i.id, i.category_id, i.organization_id, i.citizen_id, i.zone_id,
              i.title, i.status, i.priority, i.updated_at, i.created_at, i.resolution_date,
              ST_AsGeoJSON(i.location)::json AS location_geojson,
              ic.name AS category_name, o.name AS org_name, gz.name AS zone_name
       FROM incidents i
       LEFT JOIN incident_categories ic ON i.category_id = ic.id
       LEFT JOIN organizations o ON i.organization_id = o.id
       LEFT JOIN geo_zones gz ON i.zone_id = gz.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY i.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`, params);
        const countParams = params.slice(0, limitIdx - 1);
        const [countRow] = await this.dataSource.query(`SELECT COUNT(*) AS count FROM incidents i WHERE ${conditions.join(' AND ')}`, countParams);
        const total = Number(countRow.count);
        const data = rows.map((r) => ({
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
        return {
            data,
            meta: { page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) },
        };
    }
};
exports.IncidentFeedService = IncidentFeedService;
exports.IncidentFeedService = IncidentFeedService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [typeorm_1.DataSource, Object])
], IncidentFeedService);
//# sourceMappingURL=incident-feed.service.js.map