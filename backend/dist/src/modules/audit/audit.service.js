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
var AuditService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const stream_1 = require("stream");
const audit_event_entity_1 = require("../../entities/audit-event.entity");
let AuditService = AuditService_1 = class AuditService {
    constructor(repo, dataSource) {
        this.repo = repo;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(AuditService_1.name);
    }
    async record(input, manager) {
        const repo = manager ? manager.getRepository(audit_event_entity_1.AuditEventEntity) : this.repo;
        const entity = repo.create({
            actorId: input.actorId,
            action: input.action,
            resourceType: input.resourceType,
            resourceId: input.resourceId ?? null,
            justification: input.justification ?? null,
            metadata: input.metadata ?? {},
        });
        const saved = await repo.save(entity);
        return saved;
    }
    async list(filters) {
        const page = filters.page ?? AuditService_1.DEFAULT_PAGE;
        const limit = filters.limit ?? AuditService_1.DEFAULT_LIMIT;
        const offset = (page - 1) * limit;
        const { where, params } = this.buildWhere(filters);
        const itemsSql = `
      SELECT a.id,
             a.actor_id,
             CONCAT_WS(' ', u.first_name, u.last_name) AS actor_name,
             a.action,
             a.resource_type,
             a.resource_id,
             a.justification,
             a.metadata,
             a.created_at
        FROM audit_events a
        LEFT JOIN users u ON u.id = a.actor_id
       WHERE ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
        const itemsParams = [...params, limit, offset];
        const rows = await this.dataSource.query(itemsSql, itemsParams);
        const countSql = `
      SELECT COUNT(*) AS total
        FROM audit_events a
       WHERE ${where}
    `;
        const countRows = await this.dataSource.query(countSql, params);
        const total = Number(countRows[0]?.total ?? 0);
        return {
            items: rows.map(toItemDto),
            total,
        };
    }
    exportCsv(filters) {
        const ds = this.dataSource;
        const cap = AuditService_1.EXPORT_CAP;
        const batchSize = AuditService_1.EXPORT_BATCH_SIZE;
        const readable = new stream_1.Readable({ objectMode: false, read() { } });
        (async () => {
            readable.push(CSV_HEADER);
            let exported = 0;
            while (exported < cap) {
                const size = Math.min(batchSize, cap - exported);
                const { where, params } = this.buildWhere(filters);
                params.push(size, exported);
                const limitIdx = params.length - 1;
                const rows = await ds.query(`SELECT a.id,
                  a.actor_id,
                  CONCAT_WS(' ', u.first_name, u.last_name) AS actor_name,
                  a.action,
                  a.resource_type,
                  a.resource_id,
                  a.justification,
                  a.created_at
             FROM audit_events a
             LEFT JOIN users u ON u.id = a.actor_id
            WHERE ${where}
            ORDER BY a.created_at ASC
            LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`, params);
                if (rows.length === 0)
                    break;
                for (const row of rows) {
                    readable.push(toCsvLine(row));
                }
                exported += rows.length;
                if (rows.length < size)
                    break;
            }
            readable.push(null);
        })().catch((err) => readable.destroy(err));
        return readable;
    }
    buildWhere(filters) {
        const conditions = ['1=1'];
        const params = [];
        if (filters.date_from) {
            params.push(filters.date_from);
            conditions.push(`a.created_at >= $${params.length}`);
        }
        if (filters.date_to) {
            params.push(filters.date_to);
            conditions.push(`a.created_at <= $${params.length}`);
        }
        if (filters.actor_id) {
            params.push(filters.actor_id);
            conditions.push(`a.actor_id = $${params.length}`);
        }
        if (filters.action) {
            params.push(filters.action);
            conditions.push(`a.action = $${params.length}`);
        }
        if (filters.resource_type) {
            params.push(filters.resource_type);
            conditions.push(`a.resource_type = $${params.length}`);
        }
        return { where: conditions.join(' AND '), params };
    }
};
exports.AuditService = AuditService;
AuditService.DEFAULT_PAGE = 1;
AuditService.DEFAULT_LIMIT = 20;
AuditService.EXPORT_CAP = 10_000;
AuditService.EXPORT_BATCH_SIZE = 500;
exports.AuditService = AuditService = AuditService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(audit_event_entity_1.AuditEventEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.DataSource])
], AuditService);
const CSV_HEADER = 'id,actor_id,actor_name,action,resource_type,resource_id,justification,created_at\n';
function toItemDto(row) {
    return {
        id: row.id,
        actorId: row.actor_id,
        actorName: row.actor_name,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        justification: row.justification,
        metadata: row.metadata ?? {},
        createdAt: row.created_at,
    };
}
function toCsvLine(row) {
    return ([
        row.id,
        row.actor_id,
        csvCell(row.actor_name),
        row.action,
        row.resource_type,
        row.resource_id ?? '',
        csvCell(row.justification),
        row.created_at.toISOString(),
    ].join(',') + '\n');
}
function csvCell(value) {
    if (value === null || value === undefined)
        return '';
    if (/[",\n\r]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
//# sourceMappingURL=audit.service.js.map