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
exports.GeoZonesRepository = exports.MAX_DEPTH = void 0;
exports.buildZoneTree = buildZoneTree;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
exports.MAX_DEPTH = 1000;
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 100;
let GeoZonesRepository = class GeoZonesRepository {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async validateGeometry(geoJson) {
        const rows = await this.dataSource.query(`SELECT ST_IsValid(g)        AS valid,
              ST_IsValidReason(g)  AS reason,
              ST_IsEmpty(g)        AS empty,
              ST_GeometryType(g)   AS geom_type,
              ST_DWithin(
                g::geography,
                ST_SetSRID(ST_MakePoint(-78.5, -1.5), 4326)::geography,
                500000
              )                    AS in_bounds
         FROM (
           SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326)) AS g
         ) t`, [JSON.stringify(geoJson)]);
        return rows[0];
    }
    async create(input) {
        const rows = await this.dataSource.query(`INSERT INTO geo_zones (id, name, parent_id, level, active, polygon, code)
       VALUES (gen_random_uuid(), $1, $2, $3, $4,
               CASE WHEN $5::text IS NULL THEN NULL
                    ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5::text), 4326)) END,
               $6)
       RETURNING id, name, parent_id, level, active,
                 ST_AsGeoJSON(polygon)::json AS polygon, code, created_at`, [
            input.name,
            input.parentId,
            input.level,
            input.active,
            input.polygon === null ? null : JSON.stringify(input.polygon),
            input.code,
        ]);
        return rows[0];
    }
    async update(id, patch) {
        const rows = await this.dataSource.query(`UPDATE geo_zones SET
         name      = COALESCE($2, name),
         parent_id = CASE WHEN $3::boolean THEN $4::uuid ELSE parent_id END,
         level     = COALESCE($5, level),
         active    = COALESCE($6::boolean, active),
         polygon   = CASE WHEN $7::text IS NULL THEN polygon
                          ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7::text), 4326)) END,
         code      = CASE WHEN $8::boolean THEN $9::varchar ELSE code END
       WHERE id = $1
       RETURNING id, name, parent_id, level, active,
                 ST_AsGeoJSON(polygon)::json AS polygon, code, created_at`, [
            id,
            patch.name,
            patch.parentIdProvided,
            patch.parentId,
            patch.level,
            patch.active,
            patch.polygon === undefined ? undefined : JSON.stringify(patch.polygon),
            patch.codeProvided,
            patch.code,
        ]);
        return rows[0] ?? null;
    }
    async deactivate(id) {
        const rows = await this.dataSource.query(`WITH prev AS (SELECT active FROM geo_zones WHERE id = $1)
       UPDATE geo_zones SET active = false
        WHERE id = $1
       RETURNING (SELECT active FROM prev) IS DISTINCT FROM false AS changed`, [id]);
        return rows[0] ?? null;
    }
    async findById(id) {
        const rows = await this.dataSource.query(`SELECT id, name, parent_id, level, active,
              ST_AsGeoJSON(polygon)::json AS polygon, code, created_at
         FROM geo_zones
        WHERE id = $1`, [id]);
        return rows[0] ?? null;
    }
    async findAll(filters) {
        const perPage = Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const page = Math.max(filters.page ?? 1, 1);
        const offset = (page - 1) * perPage;
        const conditions = [];
        const params = [];
        if (filters.active !== undefined) {
            params.push(filters.active);
            conditions.push(`g.active = $${params.length}`);
        }
        else if (!filters.includeInactive) {
            conditions.push('g.active = true');
        }
        if (filters.search) {
            params.push(`%${filters.search}%`);
            conditions.push(`g.name ILIKE $${params.length}`);
        }
        if (filters.parentId === null) {
            conditions.push('g.parent_id IS NULL');
        }
        else if (filters.parentId !== undefined) {
            params.push(filters.parentId);
            conditions.push(`g.parent_id = $${params.length}`);
        }
        if (filters.level !== undefined) {
            params.push(filters.level);
            conditions.push(`g.level = $${params.length}`);
        }
        if (filters.code !== undefined) {
            params.push(filters.code);
            conditions.push(`g.code = $${params.length}`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const itemsParams = [...params, perPage, offset];
        const items = await this.dataSource.query(`SELECT g.id, g.name, g.parent_id, g.level, g.active,
              ST_AsGeoJSON(g.polygon)::json AS polygon, g.code, g.created_at,
              p.name AS parent_name
         FROM geo_zones g
         LEFT JOIN geo_zones p ON g.parent_id = p.id
         ${whereClause}
        ORDER BY g.name ASC
        LIMIT $${itemsParams.length - 1} OFFSET $${itemsParams.length}`, itemsParams);
        const countRows = await this.dataSource.query(`SELECT COUNT(*) AS count FROM geo_zones g ${whereClause}`, params);
        return { items, total: parseInt(countRows[0]?.count ?? '0', 10) };
    }
    async listFlat(rootId) {
        if (rootId === null) {
            return this.dataSource.query(`WITH RECURSIVE subtree AS (
           SELECT id, name, code, parent_id, level, active, created_at, 0 AS depth
             FROM geo_zones
            WHERE parent_id IS NULL
            UNION ALL
           SELECT z.id, z.name, z.code, z.parent_id, z.level, z.active, z.created_at, s.depth + 1
             FROM geo_zones z
            INNER JOIN subtree s ON z.parent_id = s.id
            WHERE s.depth < ${exports.MAX_DEPTH}
         )
         SELECT id, name, code, parent_id, level, active, created_at, depth FROM subtree
         ORDER BY name ASC`);
        }
        return this.dataSource.query(`WITH RECURSIVE subtree AS (
         SELECT id, name, code, parent_id, level, active, created_at, 0 AS depth
           FROM geo_zones
          WHERE id = $1
          UNION ALL
         SELECT z.id, z.name, z.code, z.parent_id, z.level, z.active, z.created_at, s.depth + 1
           FROM geo_zones z
          INNER JOIN subtree s ON z.parent_id = s.id
          WHERE s.depth < ${exports.MAX_DEPTH}
       )
       SELECT id, name, code, parent_id, level, active, created_at, depth FROM subtree
       ORDER BY name ASC`, [rootId]);
    }
    async getSubtree(rootId) {
        const rows = await this.listFlat(rootId);
        return buildZoneTree(rows);
    }
    async findParentLevel(parentId) {
        const rows = await this.dataSource.query(`SELECT level FROM geo_zones WHERE id = $1`, [parentId]);
        return rows[0]?.level ?? null;
    }
    async validateNoCycles(zoneId, proposedParentId) {
        if (proposedParentId === null) {
            return true;
        }
        if (zoneId !== null && proposedParentId === zoneId) {
            return false;
        }
        let currentId = proposedParentId;
        let iterations = 0;
        while (currentId !== null && iterations < exports.MAX_DEPTH) {
            if (zoneId !== null && currentId === zoneId) {
                return false;
            }
            const rows = await this.dataSource.query(`SELECT parent_id FROM geo_zones WHERE id = $1`, [currentId]);
            if (rows.length === 0) {
                break;
            }
            currentId = rows[0].parent_id;
            iterations += 1;
        }
        return true;
    }
    async createInTransaction(queryRunner, input) {
        const rows = await queryRunner.manager.query(`INSERT INTO geo_zones (id, name, parent_id, level, active, polygon, code)
       VALUES (gen_random_uuid(), $1, $2, $3, $4,
               CASE WHEN $5::text IS NULL THEN NULL
                    ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5::text), 4326)) END,
               $6)
       RETURNING id, name, parent_id, level, active,
                 ST_AsGeoJSON(polygon)::json AS polygon, code, created_at`, [
            input.name,
            input.parentId,
            input.level,
            input.active,
            input.polygon === null ? null : JSON.stringify(input.polygon),
            input.code,
        ]);
        return rows[0];
    }
    async findByCode(code) {
        const rows = await this.dataSource.query(`SELECT id, name, parent_id, level, active,
              ST_AsGeoJSON(polygon)::json AS polygon, code, created_at
         FROM geo_zones
        WHERE code = $1`, [code]);
        return rows[0] ?? null;
    }
    async findParentBySpatialContainment(geometry) {
        const rows = await this.dataSource.query(`SELECT id, name, level
         FROM geo_zones
        WHERE active = true
          AND polygon IS NOT NULL
          AND ST_Contains(
                polygon,
                ST_Centroid(ST_GeomFromGeoJSON($1::text))
              )
        ORDER BY CASE level
                   WHEN 'parroquia' THEN 1
                   WHEN 'canton'    THEN 2
                   WHEN 'provincia' THEN 3
                   ELSE 4
                 END
        LIMIT 1`, [JSON.stringify(geometry)]);
        return rows[0] ?? null;
    }
    async getFormData() {
        return this.dataSource.query(`SELECT id, name, code, level
         FROM geo_zones
        WHERE active = true
        ORDER BY level, name`);
    }
};
exports.GeoZonesRepository = GeoZonesRepository;
exports.GeoZonesRepository = GeoZonesRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], GeoZonesRepository);
function buildZoneTree(rows) {
    const nodesById = new Map();
    for (const row of rows) {
        nodesById.set(row.id, {
            id: row.id,
            name: row.name,
            parent_id: row.parent_id,
            level: row.level,
            active: row.active,
            created_at: row.created_at,
            code: row.code ?? null,
            children: [],
        });
    }
    const roots = [];
    for (const row of rows) {
        const node = nodesById.get(row.id);
        if (row.parent_id !== null && nodesById.has(row.parent_id)) {
            nodesById.get(row.parent_id).children.push(node);
        }
        else {
            roots.push(node);
        }
    }
    sortTree(roots);
    return roots;
}
function sortTree(nodes) {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
        sortTree(node.children);
    }
}
//# sourceMappingURL=geo-zones.repository.js.map