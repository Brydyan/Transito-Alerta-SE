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
exports.IncidentCategoriesRepository = void 0;
exports.buildTree = buildTree;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const MAX_DEPTH = 1000;
let IncidentCategoriesRepository = class IncidentCategoriesRepository {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async listFlat(rootId) {
        if (rootId === null) {
            return this.dataSource.query(`WITH RECURSIVE subtree AS (
           SELECT id, name, parent_id, created_at, 0 AS depth
           FROM incident_categories
           WHERE parent_id IS NULL AND deleted_at IS NULL
           UNION ALL
           SELECT c.id, c.name, c.parent_id, c.created_at, s.depth + 1
           FROM incident_categories c
           INNER JOIN subtree s ON c.parent_id = s.id
           WHERE s.depth < ${MAX_DEPTH} AND c.deleted_at IS NULL
         )
         SELECT id, name, parent_id, created_at, depth FROM subtree`);
        }
        return this.dataSource.query(`WITH RECURSIVE subtree AS (
         SELECT id, name, parent_id, created_at, 0 AS depth
         FROM incident_categories
         WHERE id = $1 AND deleted_at IS NULL
         UNION ALL
         SELECT c.id, c.name, c.parent_id, c.created_at, s.depth + 1
         FROM incident_categories c
         INNER JOIN subtree s ON c.parent_id = s.id
         WHERE s.depth < ${MAX_DEPTH} AND c.deleted_at IS NULL
       )
       SELECT id, name, parent_id, created_at, depth FROM subtree`, [rootId]);
    }
    async getSubtree(rootId) {
        const rows = await this.listFlat(rootId);
        return buildTree(rows);
    }
    async validateNoCycles(categoryId, proposedParentId) {
        if (proposedParentId === null) {
            return true;
        }
        if (categoryId !== null && proposedParentId === categoryId) {
            return false;
        }
        let currentId = proposedParentId;
        let iterations = 0;
        while (currentId !== null && iterations < MAX_DEPTH) {
            if (categoryId !== null && currentId === categoryId) {
                return false;
            }
            const rows = await this.dataSource.query(`SELECT parent_id FROM incident_categories WHERE id = $1`, [currentId]);
            if (rows.length === 0) {
                break;
            }
            currentId = rows[0].parent_id;
            iterations += 1;
        }
        return true;
    }
};
exports.IncidentCategoriesRepository = IncidentCategoriesRepository;
exports.IncidentCategoriesRepository = IncidentCategoriesRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], IncidentCategoriesRepository);
function buildTree(rows) {
    const nodesById = new Map();
    for (const row of rows) {
        nodesById.set(row.id, {
            id: row.id,
            name: row.name,
            parent_id: row.parent_id,
            created_at: row.created_at,
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
//# sourceMappingURL=incident-categories.repository.js.map