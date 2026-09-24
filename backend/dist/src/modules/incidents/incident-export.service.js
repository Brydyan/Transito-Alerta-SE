"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentExportService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const stream_1 = require("stream");
const ExcelJS = __importStar(require("exceljs"));
const CSV_HEADER = 'id,title,status,priority,organization,category,created_at,resolution_date\n';
const BATCH_SIZE = 500;
let IncidentExportService = class IncidentExportService {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    buildWhere(query, user, params) {
        const conditions = ['1=1'];
        if (user.roleName !== 'master') {
            if (user.organizationId) {
                params.push(user.organizationId);
                conditions.push(`i.organization_id = $${params.length}`);
            }
            else {
                conditions.push('1=0');
            }
        }
        if (query.inicio) {
            params.push(query.inicio);
            conditions.push(`i.created_at >= $${params.length}`);
        }
        if (query.fin) {
            params.push(query.fin);
            conditions.push(`i.created_at <= $${params.length}`);
        }
        if (query.tipo_id) {
            params.push(query.tipo_id);
            conditions.push(`i.category_id = $${params.length}`);
        }
        return conditions.join(' AND ');
    }
    async countFiltered(query, user) {
        const params = [];
        const where = this.buildWhere(query, user, params);
        const [row] = await this.dataSource.query(`SELECT COUNT(*) AS count FROM incidents i WHERE ${where} AND i.deleted_at IS NULL`, params);
        return Number(row.count);
    }
    createCsvStream(query, user, cap) {
        const ds = this.dataSource;
        const buildWhere = this.buildWhere.bind(this);
        const readable = new stream_1.Readable({
            objectMode: false,
            read() { },
        });
        (async () => {
            readable.push(CSV_HEADER);
            let exported = 0;
            while (exported < cap) {
                const batchSize = Math.min(BATCH_SIZE, cap - exported);
                const params = [];
                const where = buildWhere(query, user, params);
                params.push(batchSize, exported);
                const limitIdx = params.length - 1;
                const rows = await ds.query(`SELECT i.id, i.title, i.status, i.priority, o.name AS org_name,
                  ic.name AS category_name, i.created_at, i.updated_at, i.resolution_date
           FROM incidents i
           LEFT JOIN organizations o ON i.organization_id = o.id
           LEFT JOIN incident_categories ic ON i.category_id = ic.id
           WHERE ${where} AND i.deleted_at IS NULL
           ORDER BY i.created_at ASC
           LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`, params);
                if (rows.length === 0)
                    break;
                for (const row of rows) {
                    const resDate = row.resolution_date ? row.resolution_date.toISOString() : '';
                    const line = [
                        row.id,
                        `"${(row.title ?? '').replace(/"/g, '""')}"`,
                        row.status,
                        row.priority,
                        `"${(row.org_name ?? '').replace(/"/g, '""')}"`,
                        `"${(row.category_name ?? '').replace(/"/g, '""')}"`,
                        row.created_at.toISOString(),
                        resDate,
                    ].join(',') + '\n';
                    readable.push(line);
                }
                exported += rows.length;
                if (rows.length < batchSize)
                    break;
            }
            readable.push(null);
        })().catch((err) => readable.destroy(err));
        return readable;
    }
    createXlsxStream(query, user, cap) {
        const ds = this.dataSource;
        const buildWhere = this.buildWhere.bind(this);
        const passThrough = new stream_1.PassThrough();
        const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: passThrough });
        const sheet = workbook.addWorksheet('Incidencias');
        sheet.columns = [
            { header: 'ID', key: 'id', width: 38 },
            { header: 'Título', key: 'title', width: 40 },
            { header: 'Estado', key: 'status', width: 12 },
            { header: 'Prioridad', key: 'priority', width: 12 },
            { header: 'Organización', key: 'org_name', width: 30 },
            { header: 'Categoría', key: 'category_name', width: 25 },
            { header: 'Fecha creación', key: 'created_at', width: 22 },
            { header: 'Fecha resolución', key: 'resolution_date', width: 22 },
        ];
        (async () => {
            let exported = 0;
            while (exported < cap) {
                const batchSize = Math.min(BATCH_SIZE, cap - exported);
                const params = [];
                const where = buildWhere(query, user, params);
                params.push(batchSize, exported);
                const limitIdx = params.length - 1;
                const rows = await ds.query(`SELECT i.id, i.title, i.status, i.priority, o.name AS org_name,
                  ic.name AS category_name, i.created_at, i.resolution_date
           FROM incidents i
           LEFT JOIN organizations o ON i.organization_id = o.id
           LEFT JOIN incident_categories ic ON i.category_id = ic.id
           WHERE ${where} AND i.deleted_at IS NULL
           ORDER BY i.created_at ASC
           LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`, params);
                if (rows.length === 0)
                    break;
                for (const row of rows) {
                    sheet.addRow({
                        id: row.id,
                        title: row.title ?? '',
                        status: row.status,
                        priority: row.priority,
                        org_name: row.org_name ?? '',
                        category_name: row.category_name ?? '',
                        created_at: row.created_at.toISOString(),
                        resolution_date: row.resolution_date ? row.resolution_date.toISOString() : '',
                    }).commit();
                }
                exported += rows.length;
                if (rows.length < batchSize)
                    break;
            }
            await sheet.commit();
            await workbook.commit();
        })().catch((err) => passThrough.destroy(err));
        return passThrough;
    }
    async createExportStream(query, user, cap, format = 'csv') {
        const now = new Date();
        const ts = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
        if (format === 'xlsx') {
            const stream = this.createXlsxStream(query, user, cap);
            return {
                stream,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                filename: `incidencias-${ts}.xlsx`,
            };
        }
        const stream = this.createCsvStream(query, user, cap);
        return {
            stream,
            contentType: 'text/csv; charset=utf-8',
            filename: `incidencias-${ts}.csv`,
        };
    }
};
exports.IncidentExportService = IncidentExportService;
exports.IncidentExportService = IncidentExportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], IncidentExportService);
//# sourceMappingURL=incident-export.service.js.map