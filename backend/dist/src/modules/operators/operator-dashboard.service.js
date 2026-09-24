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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperatorDashboardService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
let OperatorDashboardService = class OperatorDashboardService {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async forOperator(userId, filters) {
        const page = filters.page ?? 1;
        const perPage = filters.per_page ?? 20;
        const offset = (page - 1) * perPage;
        const [statsRows] = await this.dataSource.query(`SELECT
         COUNT(*) AS total_assigned,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status = 'resolved' AND DATE(updated_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS resolved_today
       FROM incidents
       WHERE (claimed_by = $1 OR assigned_to = $1)`, [userId]);
        const conditions = ['(i.claimed_by = $1 OR i.assigned_to = $1)'];
        const params = [userId];
        if (filters.inicio) {
            params.push(filters.inicio);
            conditions.push(`i.created_at >= $${params.length}`);
        }
        if (filters.fin) {
            params.push(filters.fin);
            conditions.push(`i.created_at <= $${params.length}`);
        }
        if (filters.location_id) {
            params.push(filters.location_id);
            conditions.push(`i.zone_id = $${params.length}`);
        }
        const where = conditions.join(' AND ');
        params.push(perPage);
        const limitParam = params.length;
        params.push(offset);
        const offsetParam = params.length;
        const incidentRows = await this.dataSource.query(`SELECT i.id, i.title, i.status, i.priority, i.claimed_by,
              i.category_id, ic.name AS category_name, i.created_at, i.updated_at
       FROM incidents i
       LEFT JOIN incident_categories ic ON i.category_id = ic.id
       WHERE ${where}
       ORDER BY i.updated_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`, params);
        const countParams = [userId];
        const countConditions = ['(i.claimed_by = $1 OR i.assigned_to = $1)'];
        if (filters.inicio) {
            countParams.push(filters.inicio);
            countConditions.push(`i.created_at >= $${countParams.length}`);
        }
        if (filters.fin) {
            countParams.push(filters.fin);
            countConditions.push(`i.created_at <= $${countParams.length}`);
        }
        if (filters.location_id) {
            countParams.push(filters.location_id);
            countConditions.push(`i.zone_id = $${countParams.length}`);
        }
        const [countRow] = await this.dataSource.query(`SELECT COUNT(*) AS count FROM incidents i WHERE ${countConditions.join(' AND ')}`, countParams);
        const total = Number(countRow.count);
        const incidents = incidentRows.map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            priority: row.priority,
            claimedBy: row.claimed_by,
            category: row.category_id
                ? { id: row.category_id, name: row.category_name ?? '' }
                : null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
        return {
            stats: {
                total_assigned: Number(statsRows.total_assigned),
                in_progress: Number(statsRows.in_progress),
                resolved_today: Number(statsRows.resolved_today),
            },
            incidents,
            pagination: {
                page,
                per_page: perPage,
                total,
                last_page: Math.max(1, Math.ceil(total / perPage)),
            },
        };
    }
};
exports.OperatorDashboardService = OperatorDashboardService;
exports.OperatorDashboardService = OperatorDashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], OperatorDashboardService);
//# sourceMappingURL=operator-dashboard.service.js.map