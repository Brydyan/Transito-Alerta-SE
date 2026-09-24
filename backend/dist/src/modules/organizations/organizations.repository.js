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
exports.OrganizationsRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 100;
const SELECT_COLUMNS = 'id, name, zone_id, max_active_claims, created_at, parent_id, incident_category_id';
let OrganizationsRepository = class OrganizationsRepository {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async create(input) {
        const rows = await this.dataSource.query(`INSERT INTO organizations (id, name, zone_id, parent_id)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING ${SELECT_COLUMNS}`, [input.name, input.zoneId, input.parentId ?? null]);
        return rows[0];
    }
    async update(id, patch) {
        const rows = await this.dataSource.query(`UPDATE organizations SET
         name      = COALESCE($2, name),
         zone_id   = CASE WHEN $3::boolean THEN $4::uuid ELSE zone_id END,
         parent_id = CASE WHEN $5::boolean THEN $6::uuid ELSE parent_id END
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`, [id, patch.name, patch.zoneIdProvided, patch.zoneId, patch.parentIdProvided, patch.parentId]);
        return rows[0] ?? null;
    }
    async updateCategory(id, incidentCategoryId) {
        const rows = await this.dataSource.query(`UPDATE organizations SET incident_category_id = $2
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`, [id, incidentCategoryId]);
        return rows[0] ?? null;
    }
    async delete(id) {
        const result = await this.dataSource.query(`UPDATE organizations SET deleted_at = now() WHERE id = $1 RETURNING id`, [id]);
        const [rows] = result;
        return rows.length > 0;
    }
    async findById(id) {
        const rows = await this.dataSource.query(`SELECT ${SELECT_COLUMNS} FROM organizations WHERE id = $1`, [id]);
        return rows[0] ?? null;
    }
    async findAll(filters) {
        const perPage = Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const page = Math.max(filters.page ?? 1, 1);
        const offset = (page - 1) * perPage;
        const conditions = ['deleted_at IS NULL'];
        const params = [];
        if (filters.search) {
            params.push(`%${filters.search}%`);
            conditions.push(`name ILIKE $${params.length}`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const itemsParams = [...params, perPage, offset];
        const items = await this.dataSource.query(`SELECT ${SELECT_COLUMNS} FROM organizations
        ${whereClause}
        ORDER BY name ASC
        LIMIT $${itemsParams.length - 1} OFFSET $${itemsParams.length}`, itemsParams);
        const countRows = await this.dataSource.query(`SELECT COUNT(*) AS count FROM organizations ${whereClause}`, params);
        return { items, total: parseInt(countRows[0]?.count ?? '0', 10) };
    }
    async findNotifiedFor(zoneId, categoryId) {
        return this.dataSource.query(`WITH RECURSIVE zone_chain AS (
         SELECT id, parent_id FROM geo_zones WHERE id = $1
         UNION ALL
         SELECT z.id, z.parent_id FROM geo_zones z JOIN zone_chain c ON z.id = c.parent_id
       ), cat_chain AS (
         SELECT id, parent_id FROM incident_categories WHERE id = $2
         UNION ALL
         SELECT c.id, c.parent_id FROM incident_categories c JOIN cat_chain cc ON c.id = cc.parent_id
       )
       SELECT o.id, o.name, o.zone_id, o.max_active_claims, o.created_at,
              o.parent_id, o.incident_category_id
       FROM organizations o
       WHERE o.deleted_at IS NULL
         AND o.zone_id IN (SELECT id FROM zone_chain)
         AND (o.incident_category_id IN (SELECT id FROM cat_chain)
              OR o.incident_category_id IS NULL)
       ORDER BY o.created_at, o.id`, [zoneId, categoryId]);
    }
};
exports.OrganizationsRepository = OrganizationsRepository;
exports.OrganizationsRepository = OrganizationsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], OrganizationsRepository);
//# sourceMappingURL=organizations.repository.js.map