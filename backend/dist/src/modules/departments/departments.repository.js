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
exports.DepartmentsRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const SELECT_COLUMNS = 'id, name, description, organization_id, created_at, updated_at, deleted_at';
const ENRICHED_SELECT_COLUMNS = 'd.id, d.name, d.description, d.organization_id, d.created_at, d.updated_at, d.deleted_at, ' +
    'o.name AS organization_name, ' +
    'COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL) AS user_count';
let DepartmentsRepository = class DepartmentsRepository {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async create(input) {
        const rows = await this.dataSource.query(`INSERT INTO departments (id, name, description, organization_id)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING ${SELECT_COLUMNS}`, [input.name, input.description, input.organizationId]);
        return rows[0];
    }
    async softDelete(id) {
        const rows = await this.dataSource.query(`UPDATE departments SET deleted_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, deleted_at`, [id]);
        return rows[0] ?? null;
    }
    async findById(id) {
        const rows = await this.dataSource.query(`SELECT ${SELECT_COLUMNS} FROM departments WHERE id = $1`, [id]);
        return rows[0] ?? null;
    }
    async findByIdActive(id) {
        const rows = await this.dataSource.query(`SELECT ${SELECT_COLUMNS} FROM departments WHERE id = $1 AND deleted_at IS NULL`, [id]);
        return rows[0] ?? null;
    }
    async existsByOrgAndName(organizationId, name) {
        const rows = await this.dataSource.query(`SELECT EXISTS (
         SELECT 1 FROM departments
          WHERE organization_id = $1
            AND name = $2
            AND deleted_at IS NULL
       ) AS exists`, [organizationId, name]);
        return rows[0]?.exists === true;
    }
    async list(filters) {
        const perPage = Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const page = Math.max(filters.page ?? 1, 1);
        const offset = (page - 1) * perPage;
        const hasOrgFilter = typeof filters.organizationId === 'string' && filters.organizationId.length > 0;
        const conditions = ['d.deleted_at IS NULL'];
        const params = [];
        if (hasOrgFilter) {
            params.push(filters.organizationId);
            conditions.push(`d.organization_id = $${params.length}`);
        }
        if (filters.search && filters.search.trim().length > 0) {
            params.push(`%${filters.search.trim()}%`);
            conditions.push(`d.name ILIKE $${params.length}`);
        }
        const whereClause = `WHERE ${conditions.join(' AND ')}`;
        const itemsParams = [...params, perPage, offset];
        const items = await this.dataSource.query(`SELECT ${ENRICHED_SELECT_COLUMNS}
         FROM departments d
         LEFT JOIN organizations o ON o.id = d.organization_id AND o.deleted_at IS NULL
         LEFT JOIN users u ON u.department_id = d.id
        ${whereClause}
        GROUP BY d.id, o.name
        ORDER BY d.name ASC
        LIMIT $${itemsParams.length - 1} OFFSET $${itemsParams.length}`, itemsParams);
        const countRows = await this.dataSource.query(`SELECT COUNT(*) AS count FROM departments ${whereClause.replace(/\bd\./g, '')}`, params);
        const categoryMap = await this.loadCategoryIdsByDeptIds(items.map((i) => i.id));
        for (const item of items) {
            item.category_ids = categoryMap.get(item.id) ?? [];
        }
        return { items, total: parseInt(countRows[0]?.count ?? '0', 10) };
    }
    async findByUser(userId) {
        const rows = await this.dataSource.query(`SELECT d.id, d.name, d.description, d.organization_id, d.created_at,
              d.updated_at, d.deleted_at
         FROM departments d
         JOIN users u ON u.department_id = d.id
        WHERE u.id = $1
          AND u.deleted_at IS NULL
          AND d.deleted_at IS NULL`, [userId]);
        return rows[0] ?? null;
    }
    async orphanIncidents(departmentId) {
        const result = await this.dataSource.query(`UPDATE incidents SET department_id = NULL WHERE department_id = $1`, [departmentId]);
        return result[1];
    }
    async replaceCategoriesForDept(deptId, categoryIds) {
        await this.dataSource.query('DELETE FROM department_incident_categories WHERE department_id = $1', [deptId]);
        if (categoryIds.length > 0) {
            await this.dataSource.query(`INSERT INTO department_incident_categories (department_id, incident_category_id)
         SELECT $1, UNNEST($2::uuid[])
         ON CONFLICT DO NOTHING`, [deptId, categoryIds]);
        }
    }
    async loadCategoryIdsByDeptIds(deptIds) {
        const map = new Map();
        if (deptIds.length === 0) {
            return map;
        }
        const rows = await this.dataSource.query(`SELECT department_id, incident_category_id
           FROM department_incident_categories
          WHERE department_id = ANY($1::uuid[])
          ORDER BY department_id, incident_category_id`, [deptIds]);
        for (const row of rows) {
            const list = map.get(row.department_id) ?? [];
            list.push(row.incident_category_id);
            map.set(row.department_id, list);
        }
        return map;
    }
    async update(id, patch) {
        const rows = await this.dataSource.query(`UPDATE departments SET
         name        = COALESCE($2, name),
         description = CASE WHEN $3::boolean THEN $4::text ELSE description END
       WHERE id = $1
         AND deleted_at IS NULL
       RETURNING ${SELECT_COLUMNS}`, [id, patch.name, patch.descriptionProvided, patch.description]);
        return rows[0] ?? null;
    }
};
exports.DepartmentsRepository = DepartmentsRepository;
exports.DepartmentsRepository = DepartmentsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], DepartmentsRepository);
//# sourceMappingURL=departments.repository.js.map