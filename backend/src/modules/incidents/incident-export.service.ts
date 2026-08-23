import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Readable } from 'stream';
import { AuthContext } from '../../common/authz/subject-scope';
import { ExportQueryDto } from './dto/export-query.dto';

const CSV_HEADER = 'id,title,status,priority,organization,category,created_at,resolution_date\n';
const BATCH_SIZE = 500;

@Injectable()
export class IncidentExportService {
  constructor(private readonly dataSource: DataSource) {}

  private buildWhere(query: ExportQueryDto, user: AuthContext, params: unknown[]): string {
    const conditions: string[] = ['1=1'];

    if (user.roleName !== 'admin_sistema') {
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
      `SELECT COUNT(*) AS count FROM incidents i WHERE ${where}`,
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
          created_at: Date; updated_at: Date;
        }[]>(
          `SELECT i.id, i.title, i.status, i.priority, o.name AS org_name,
                  ic.name AS category_name, i.created_at, i.updated_at
           FROM incidents i
           LEFT JOIN organizations o ON i.organization_id = o.id
           LEFT JOIN incident_categories ic ON i.category_id = ic.id
           WHERE ${where}
           ORDER BY i.created_at ASC
           LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
          params,
        );

        if (rows.length === 0) break;

        for (const row of rows) {
          const resDate = row.status === 'resolved' ? row.updated_at.toISOString() : '';
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
}
