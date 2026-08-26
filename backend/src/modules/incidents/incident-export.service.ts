import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PassThrough, Readable } from 'stream';
import * as ExcelJS from 'exceljs';
import { AuthContext } from '../../common/authz/subject-scope';
import { ExportQueryDto } from './dto/export-query.dto';

export type ExportFormat = 'csv' | 'xlsx';

export interface ExportStreamResult {
  stream: Readable | PassThrough;
  contentType: string;
  filename: string;
}

const CSV_HEADER = 'id,title,status,priority,organization,category,created_at,resolution_date\n';
const BATCH_SIZE = 500;

@Injectable()
export class IncidentExportService {
  constructor(private readonly dataSource: DataSource) {}

  private buildWhere(query: ExportQueryDto, user: AuthContext, params: unknown[]): string {
    const conditions: string[] = ['1=1'];

    if (user.roleName !== 'master') {
      if (user.organizationId) {
        params.push(user.organizationId);
        conditions.push(`i.organization_id = $${params.length}`);
      } else {
        conditions.push('1=0');
      }
    }
    if (query.inicio) { params.push(query.inicio); conditions.push(`i.created_at >= $${params.length}`); }
    if (query.fin) { params.push(query.fin); conditions.push(`i.created_at <= $${params.length}`); }
    if (query.tipo_id) { params.push(query.tipo_id); conditions.push(`i.category_id = $${params.length}`); }

    return conditions.join(' AND ');
  }

  async countFiltered(query: ExportQueryDto, user: AuthContext): Promise<number> {
    const params: unknown[] = [];
    const where = this.buildWhere(query, user, params);
    const [row] = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM incidents i WHERE ${where} AND i.deleted_at IS NULL`,
      params,
    );
    return Number(row.count);
  }

  createCsvStream(query: ExportQueryDto, user: AuthContext, cap: number): Readable {
    const ds = this.dataSource;
    const buildWhere = this.buildWhere.bind(this);

    const readable = new Readable({
      objectMode: false,
      read() {},
    });

    (async () => {
      readable.push(CSV_HEADER);
      let exported = 0;

      while (exported < cap) {
        const batchSize = Math.min(BATCH_SIZE, cap - exported);
        const params: unknown[] = [];
        const where = buildWhere(query, user, params);
        params.push(batchSize, exported);
        const limitIdx = params.length - 1;

        const rows = await ds.query<{
          id: string; title: string; status: string; priority: string;
          org_name: string | null; category_name: string | null;
          created_at: Date; updated_at: Date; resolution_date: Date | null;
        }[]>(
          // T6.3: use real resolution_date column instead of computing from updated_at
          `SELECT i.id, i.title, i.status, i.priority, o.name AS org_name,
                  ic.name AS category_name, i.created_at, i.updated_at, i.resolution_date
           FROM incidents i
           LEFT JOIN organizations o ON i.organization_id = o.id
           LEFT JOIN incident_categories ic ON i.category_id = ic.id
           WHERE ${where} AND i.deleted_at IS NULL
           ORDER BY i.created_at ASC
           LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
          params,
        );

        if (rows.length === 0) break;

        for (const row of rows) {
          // T6.3: use real resolution_date, not inline updated_at computation
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
        if (rows.length < batchSize) break;
      }

      readable.push(null);
    })().catch((err) => readable.destroy(err));

    return readable;
  }

  /**
   * T6.7.A2 — XLSX stream using ExcelJS streaming writer.
   * Same columns and query as CSV, streamed into a PassThrough piped to the response.
   */
  createXlsxStream(query: ExportQueryDto, user: AuthContext, cap: number): PassThrough {
    const ds = this.dataSource;
    const buildWhere = this.buildWhere.bind(this);
    const passThrough = new PassThrough();

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
        const params: unknown[] = [];
        const where = buildWhere(query, user, params);
        params.push(batchSize, exported);
        const limitIdx = params.length - 1;

        const rows = await ds.query<{
          id: string; title: string; status: string; priority: string;
          org_name: string | null; category_name: string | null;
          created_at: Date; resolution_date: Date | null;
        }[]>(
          `SELECT i.id, i.title, i.status, i.priority, o.name AS org_name,
                  ic.name AS category_name, i.created_at, i.resolution_date
           FROM incidents i
           LEFT JOIN organizations o ON i.organization_id = o.id
           LEFT JOIN incident_categories ic ON i.category_id = ic.id
           WHERE ${where} AND i.deleted_at IS NULL
           ORDER BY i.created_at ASC
           LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
          params,
        );

        if (rows.length === 0) break;

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
        if (rows.length < batchSize) break;
      }

      await sheet.commit();
      await workbook.commit();
    })().catch((err) => passThrough.destroy(err));

    return passThrough;
  }

  /**
   * T6.7.A2 — Factory that returns the right stream, content-type and filename
   * based on the requested format ('csv' | 'xlsx').
   */
  async createExportStream(
    query: ExportQueryDto,
    user: AuthContext,
    cap: number,
    format: ExportFormat = 'csv',
  ): Promise<ExportStreamResult> {
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
}
