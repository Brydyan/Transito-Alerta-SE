import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { IncidentPriority, IncidentStatus } from '../../entities/incident.entity';

export interface IncidentRow {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  priority: IncidentPriority;
  citizen_id: string;
  assigned_to: string | null;
  zone_id: string | null;
  geofence_matched: boolean;
  lat: number;
  lng: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateIncidentInput {
  title: string;
  description: string | null;
  lat: number;
  lng: number;
  priority: IncidentPriority;
  citizenId: string;
  zoneId: string | null;
  geofenceMatched: boolean;
}

const SELECT_COLUMNS = `
  id, title, description, status, priority,
  citizen_id, assigned_to, zone_id, geofence_matched,
  ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
  created_at, updated_at
`;

/**
 * IncidentsRepository (T2.1) — raw PostGIS SQL for the geometry column,
 * mirroring GeofencingRepository's isolation + parameterization convention
 * (design D4 / CC1 security hardening). ST_Point(x, y) = ST_Point(lng, lat).
 */
@Injectable()
export class IncidentsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(input: CreateIncidentInput): Promise<IncidentRow> {
    const rows: IncidentRow[] = await this.dataSource.query(
      `INSERT INTO incidents
         (title, description, location, status, priority, citizen_id, zone_id, geofence_matched)
       VALUES
         ($1, $2, ST_SetSRID(ST_Point($3, $4), 4326), 'pending', $5, $6, $7, $8)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.title,
        input.description,
        input.lng,
        input.lat,
        input.priority,
        input.citizenId,
        input.zoneId,
        input.geofenceMatched,
      ],
    );
    return rows[0];
  }

  async findAll(filters: { zoneId?: string; status?: IncidentStatus } = {}): Promise<IncidentRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.zoneId) {
      params.push(filters.zoneId);
      conditions.push(`zone_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.dataSource.query(
      `SELECT ${SELECT_COLUMNS} FROM incidents ${where} ORDER BY created_at DESC LIMIT 1000`,
      params,
    );
  }

  async findOne(id: string): Promise<IncidentRow | null> {
    const rows: IncidentRow[] = await this.dataSource.query(
      `SELECT ${SELECT_COLUMNS} FROM incidents WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async updateStatus(id: string, status: IncidentStatus): Promise<IncidentRow | null> {
    const rows: IncidentRow[] = await this.dataSource.query(
      `UPDATE incidents SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [id, status],
    );
    return rows[0] ?? null;
  }
}
