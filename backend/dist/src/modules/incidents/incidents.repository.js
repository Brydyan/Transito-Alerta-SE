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
exports.IncidentsRepository = exports.getSelectColumns = void 0;
exports.unwrapReturningRows = unwrapReturningRows;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const scope_sql_1 = require("../../common/authz/scope-sql");
const getSelectColumns = (actorId) => `
  id, title, description, status, priority,
  citizen_id, is_anonymous,
  assigned_to, zone_id, geofence_matched, organization_id,
  category_id, claimed_by, claimed_at, approved_by, approved_at, rejected_by, rejected_at,
  rejection_reason, closed_reason, resolution_date,
  ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
  created_at, updated_at, deleted_at,
  COALESCE((SELECT COUNT(*) FROM incident_followers WHERE incident_id = incidents.id)::int, 0) AS follower_count,
  COALESCE((SELECT COUNT(*) FROM incident_corroborations WHERE incident_id = incidents.id)::int, 0) AS corroboration_count,
  EXISTS(SELECT 1 FROM incident_followers WHERE incident_id = incidents.id AND user_id = ${actorId ? `'${actorId.replace(/'/g, "''")}'::uuid` : 'NULL'}) AS is_followed_by_me,
  EXISTS(SELECT 1 FROM incident_corroborations WHERE incident_id = incidents.id AND user_id = ${actorId ? `'${actorId.replace(/'/g, "''")}'::uuid` : 'NULL'}) AS is_corroborated_by_me
`;
exports.getSelectColumns = getSelectColumns;
let IncidentsRepository = class IncidentsRepository {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async create(input, manager) {
        const runner = manager ?? this.dataSource;
        const rows = await runner.query(`INSERT INTO incidents
         (title, description, location, status, priority, citizen_id, is_anonymous, zone_id, geofence_matched, organization_id, category_id)
       VALUES
         ($1, $2, ST_SetSRID(ST_Point($3, $4), 4326), 'pending', $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${(0, exports.getSelectColumns)(input.citizenId)}`, [
            input.title,
            input.description,
            input.lng,
            input.lat,
            input.priority,
            input.citizenId,
            input.isAnonymous,
            input.zoneId,
            input.geofenceMatched,
            input.organizationId,
            input.categoryId ?? null,
        ]);
        return rows[0];
    }
    async findAll(filters, scope, actorId) {
        const conditions = [];
        const params = [];
        if (filters.zoneId) {
            params.push(filters.zoneId);
            conditions.push(`zone_id = $${params.length}`);
        }
        if (filters.status) {
            params.push(filters.status);
            conditions.push(`status = $${params.length}`);
        }
        const scopeSql = (0, scope_sql_1.scopeToSql)(scope, { table: 'incidents', paramOffset: params.length + 1 });
        conditions.push(scopeSql.fragment);
        params.push(...scopeSql.params);
        conditions.push('deleted_at IS NULL');
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        return this.dataSource.query(`SELECT ${(0, exports.getSelectColumns)(actorId)} FROM incidents ${where} ORDER BY created_at DESC LIMIT 1000`, params);
    }
    async findOne(id, scope, actorId) {
        const scopeSql = (0, scope_sql_1.scopeToSql)(scope, { table: 'incidents', paramOffset: 2 });
        const rows = await this.dataSource.query(`SELECT ${(0, exports.getSelectColumns)(actorId)} FROM incidents WHERE id = $1 AND ${scopeSql.fragment} AND deleted_at IS NULL`, [id, ...scopeSql.params]);
        return rows[0] ?? null;
    }
    async update(id, values, actorId) {
        const result = await this.dataSource.query(`UPDATE incidents
         SET title = $2,
             description = $3,
             category_id = $4
       WHERE id = $1
       RETURNING ${(0, exports.getSelectColumns)(actorId)}`, [id, values.title, values.description, values.categoryId]);
        const row = unwrapReturningRows(result)[0];
        if (!row) {
            throw new Error(`Incident ${id} vanished mid-update`);
        }
        return row;
    }
    async softDelete(id) {
        await this.dataSource.query(`UPDATE incidents SET deleted_at = NOW() WHERE id = $1`, [id]);
    }
};
exports.IncidentsRepository = IncidentsRepository;
exports.IncidentsRepository = IncidentsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], IncidentsRepository);
function unwrapReturningRows(result) {
    if (!Array.isArray(result)) {
        return [];
    }
    if (Array.isArray(result[0])) {
        return result[0];
    }
    return result;
}
//# sourceMappingURL=incidents.repository.js.map