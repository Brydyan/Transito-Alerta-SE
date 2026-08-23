import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import {
  DashboardIncidentDto,
  OperatorDashboardResponseDto,
} from './dto/operator-dashboard-response.dto';

interface StatsRow {
  total_assigned: string;
  in_progress: string;
  resolved_today: string;
}

interface IncidentRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  claimed_by: string | null;
  category_id: string | null;
  category_name: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CountRow {
  count: string;
}

@Injectable()
export class OperatorDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async forOperator(
    userId: string,
    filters: DashboardQueryDto,
  ): Promise<OperatorDashboardResponseDto> {
    const page = filters.page ?? 1;
    const perPage = filters.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const [statsRows] = await this.dataSource.query<StatsRow[]>(
      `SELECT
         COUNT(*) AS total_assigned,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status = 'resolved' AND DATE(updated_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS resolved_today
       FROM incidents
       WHERE (claimed_by = $1 OR assigned_to = $1)`,
      [userId],
    );

    const conditions: string[] = ['(i.claimed_by = $1 OR i.assigned_to = $1)'];
    const params: (string | number)[] = [userId];

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

    const incidentRows = await this.dataSource.query<IncidentRow[]>(
      `SELECT i.id, i.title, i.status, i.priority, i.claimed_by,
              i.category_id, ic.name AS category_name, i.created_at, i.updated_at
       FROM incidents i
       LEFT JOIN incident_categories ic ON i.category_id = ic.id
       WHERE ${where}
       ORDER BY i.updated_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    );

    const countParams = [userId];
    const countConditions: string[] = ['(i.claimed_by = $1 OR i.assigned_to = $1)'];
    if (filters.inicio) { countParams.push(filters.inicio); countConditions.push(`i.created_at >= $${countParams.length}`); }
    if (filters.fin) { countParams.push(filters.fin); countConditions.push(`i.created_at <= $${countParams.length}`); }
    if (filters.location_id) { countParams.push(filters.location_id); countConditions.push(`i.zone_id = $${countParams.length}`); }

    const [countRow] = await this.dataSource.query<CountRow[]>(
      `SELECT COUNT(*) AS count FROM incidents i WHERE ${countConditions.join(' AND ')}`,
      countParams,
    );

    const total = Number(countRow.count);

    const incidents: DashboardIncidentDto[] = incidentRows.map((row) => ({
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
}
