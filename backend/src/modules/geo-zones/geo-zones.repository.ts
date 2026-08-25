import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { GeoZoneLevel } from '../../entities/geo-zone.entity';

export const MAX_DEPTH = 1000;

export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
  [key: string]: unknown;
}

export interface GeoZoneDetailRow {
  id: string;
  name: string;
  parent_id: string | null;
  level: GeoZoneLevel;
  active: boolean;
  polygon: GeoJsonGeometry;
  code: string | null;
  created_at: Date;
}

/**
 * Depth-annotated flat row for the CTE; omits `polygon` — a tree of many
 * MultiPolygons is a lot of JSON nobody renders.
 */
export interface GeoZoneTreeRow {
  id: string;
  name: string;
  parent_id: string | null;
  level: GeoZoneLevel;
  active: boolean;
  created_at: Date;
  depth: number;
}

export interface GeoZoneNode extends Omit<GeoZoneTreeRow, 'depth'> {
  children: GeoZoneNode[];
}

export interface GeometryCheck {
  valid: boolean;
  reason: string | null;
  empty: boolean;
  geom_type: string;
}

export interface ListFilters {
  search?: string;
  level?: GeoZoneLevel;
  /** undefined = no filter, null = roots only */
  parentId?: string | null;
  active?: boolean;
  /** default false */
  includeInactive?: boolean;
  /** T7.6.A7 — exact match on `geo_zones.code`. */
  code?: string;
  /** default 1 */
  page?: number;
  /** default 15, max 100 */
  perPage?: number;
}

export interface CreateZoneInput {
  name: string;
  parentId: string | null;
  level: GeoZoneLevel;
  active: boolean;
  polygon: GeoJsonGeometry;
  code: string | null;
}

export interface UpdateZonePatch {
  name: string | undefined;
  /** true if `parent_id` was present in the request body (even if null) */
  parentIdProvided: boolean;
  parentId: string | null | undefined;
  level: GeoZoneLevel | undefined;
  active: boolean | undefined;
  polygon: GeoJsonGeometry | undefined;
  /** true if `code` was present in the request body (even if null) */
  codeProvided: boolean;
  code: string | null | undefined;
}

const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 100;

/**
 * GeoZonesRepository (T3.8 design D2) — ALL-raw `@InjectDataSource().query()`,
 * `$n`-parameterized. Every write goes through
 * `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326))`; every read
 * projects `ST_AsGeoJSON(polygon)::json`. Mirrors
 * IncidentCategoriesRepository's cycle-guard/CTE shape (design D4/D5 of the
 * proposal).
 */
@Injectable()
export class GeoZonesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * One pre-flight round trip (design D6) returning ST_IsValid /
   * ST_IsValidReason / ST_IsEmpty / ST_GeometryType over the same
   * ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(...))) expression the write uses.
   * ST_GeometryType catches a well-formed GeoJSON Point/LineString that
   * ST_Multi silently promotes to MULTIPOINT/MULTILINESTRING.
   */
  async validateGeometry(geoJson: unknown): Promise<GeometryCheck> {
    const rows: GeometryCheck[] = await this.dataSource.query(
      `SELECT ST_IsValid(g)        AS valid,
              ST_IsValidReason(g)  AS reason,
              ST_IsEmpty(g)        AS empty,
              ST_GeometryType(g)   AS geom_type
         FROM (
           SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326)) AS g
         ) t`,
      [JSON.stringify(geoJson)],
    );
    return rows[0];
  }

  async create(input: CreateZoneInput): Promise<GeoZoneDetailRow> {
    const rows: GeoZoneDetailRow[] = await this.dataSource.query(
      `INSERT INTO geo_zones (id, name, parent_id, level, active, polygon, code)
       VALUES (gen_random_uuid(), $1, $2, $3, $4,
               ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5::text), 4326)), $6)
       RETURNING id, name, parent_id, level, active,
                 ST_AsGeoJSON(polygon)::json AS polygon, code, created_at`,
      [
        input.name,
        input.parentId,
        input.level,
        input.active,
        JSON.stringify(input.polygon),
        input.code,
      ],
    );
    return rows[0];
  }

  /**
   * Partial patch. `parent_id` needs an explicit *provided* flag (design
   * D2/repository section) because `null` is a meaningful value (detach to
   * root), which `COALESCE` cannot distinguish from "absent".
   */
  async update(id: string, patch: UpdateZonePatch): Promise<GeoZoneDetailRow | null> {
    const rows: GeoZoneDetailRow[] = await this.dataSource.query(
      `UPDATE geo_zones SET
         name      = COALESCE($2, name),
         parent_id = CASE WHEN $3::boolean THEN $4::uuid ELSE parent_id END,
         level     = COALESCE($5, level),
         active    = COALESCE($6::boolean, active),
         polygon   = CASE WHEN $7::text IS NULL THEN polygon
                          ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7::text), 4326)) END,
         code      = CASE WHEN $8::boolean THEN $9::varchar ELSE code END
       WHERE id = $1
       RETURNING id, name, parent_id, level, active,
                 ST_AsGeoJSON(polygon)::json AS polygon, code, created_at`,
      [
        id,
        patch.name,
        patch.parentIdProvided,
        patch.parentId,
        patch.level,
        patch.active,
        patch.polygon === undefined ? undefined : JSON.stringify(patch.polygon),
        patch.codeProvided,
        patch.code,
      ],
    );
    return rows[0] ?? null;
  }

  /**
   * Idempotent soft-delete (design D8): reports whether `active` actually
   * flipped so the service can skip a pointless cache purge. `null` = the
   * id does not exist (404).
   */
  async deactivate(id: string): Promise<{ changed: boolean } | null> {
    const rows: { changed: boolean }[] = await this.dataSource.query(
      `WITH prev AS (SELECT active FROM geo_zones WHERE id = $1)
       UPDATE geo_zones SET active = false
        WHERE id = $1
       RETURNING (SELECT active FROM prev) IS DISTINCT FROM false AS changed`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<GeoZoneDetailRow | null> {
    const rows: GeoZoneDetailRow[] = await this.dataSource.query(
      `SELECT id, name, parent_id, level, active,
              ST_AsGeoJSON(polygon)::json AS polygon, code, created_at
         FROM geo_zones
        WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findAll(filters: ListFilters): Promise<{ items: GeoZoneDetailRow[]; total: number }> {
    const perPage = Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(filters.page ?? 1, 1);
    const offset = (page - 1) * perPage;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.active !== undefined) {
      params.push(filters.active);
      conditions.push(`active = $${params.length}`);
    } else if (!filters.includeInactive) {
      conditions.push('active = true');
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`name ILIKE $${params.length}`);
    }

    if (filters.parentId === null) {
      conditions.push('parent_id IS NULL');
    } else if (filters.parentId !== undefined) {
      params.push(filters.parentId);
      conditions.push(`parent_id = $${params.length}`);
    }

    if (filters.level !== undefined) {
      params.push(filters.level);
      conditions.push(`level = $${params.length}`);
    }

    if (filters.code !== undefined) {
      params.push(filters.code);
      conditions.push(`code = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const itemsParams = [...params, perPage, offset];
    const items: GeoZoneDetailRow[] = await this.dataSource.query(
      `SELECT id, name, parent_id, level, active,
              ST_AsGeoJSON(polygon)::json AS polygon, code, created_at
         FROM geo_zones
         ${whereClause}
        ORDER BY name ASC
        LIMIT $${itemsParams.length - 1} OFFSET $${itemsParams.length}`,
      itemsParams,
    );

    const countRows: { count: string }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS count FROM geo_zones ${whereClause}`,
      params,
    );

    return { items, total: parseInt(countRows[0]?.count ?? '0', 10) };
  }

  /**
   * Flat, depth-annotated rows for the subtree rooted at `rootId`, or every
   * root zone (`parent_id IS NULL`) plus their full subtrees when `rootId`
   * is null. `polygon` is deliberately not projected (design, repository
   * section).
   */
  async listFlat(rootId: string | null): Promise<GeoZoneTreeRow[]> {
    if (rootId === null) {
      return this.dataSource.query(
        `WITH RECURSIVE subtree AS (
           SELECT id, name, parent_id, level, active, created_at, 0 AS depth
             FROM geo_zones
            WHERE parent_id IS NULL
            UNION ALL
           SELECT z.id, z.name, z.parent_id, z.level, z.active, z.created_at, s.depth + 1
             FROM geo_zones z
            INNER JOIN subtree s ON z.parent_id = s.id
            WHERE s.depth < ${MAX_DEPTH}
         )
         SELECT id, name, parent_id, level, active, created_at, depth FROM subtree
         ORDER BY name ASC`,
      );
    }

    return this.dataSource.query(
      `WITH RECURSIVE subtree AS (
         SELECT id, name, parent_id, level, active, created_at, 0 AS depth
           FROM geo_zones
          WHERE id = $1
          UNION ALL
         SELECT z.id, z.name, z.parent_id, z.level, z.active, z.created_at, s.depth + 1
           FROM geo_zones z
          INNER JOIN subtree s ON z.parent_id = s.id
          WHERE s.depth < ${MAX_DEPTH}
       )
       SELECT id, name, parent_id, level, active, created_at, depth FROM subtree
       ORDER BY name ASC`,
      [rootId],
    );
  }

  async getSubtree(rootId: string | null): Promise<GeoZoneNode[]> {
    const rows = await this.listFlat(rootId);
    return buildZoneTree(rows);
  }

  async findParentLevel(parentId: string): Promise<GeoZoneLevel | null> {
    const rows: { level: GeoZoneLevel }[] = await this.dataSource.query(
      `SELECT level FROM geo_zones WHERE id = $1`,
      [parentId],
    );
    return rows[0]?.level ?? null;
  }

  /**
   * Ancestor walk from `proposedParentId` up to the root (design D4),
   * verbatim port of IncidentCategoriesRepository.validateNoCycles against
   * `geo_zones`, meant to run inside the same transaction as the write that
   * calls it. Returns `false` if `zoneId` appears anywhere in that chain —
   * including as `proposedParentId` itself (self-parent).
   */
  async validateNoCycles(
    zoneId: string | null,
    proposedParentId: string | null,
  ): Promise<boolean> {
    if (proposedParentId === null) {
      return true;
    }
    if (zoneId !== null && proposedParentId === zoneId) {
      return false;
    }

    let currentId: string | null = proposedParentId;
    let iterations = 0;

    while (currentId !== null && iterations < MAX_DEPTH) {
      if (zoneId !== null && currentId === zoneId) {
        return false;
      }

      const rows: { parent_id: string | null }[] = await this.dataSource.query(
        `SELECT parent_id FROM geo_zones WHERE id = $1`,
        [currentId],
      );
      if (rows.length === 0) {
        break;
      }
      currentId = rows[0].parent_id;
      iterations += 1;
    }

    return true;
  }
}

/**
 * Links flat, depth-annotated CTE rows into a nested tree — pure function,
 * no DB. Sorted by `name` ASC per level. A row whose `parent_id` is not
 * present in the row set (true root, or the top of a subtree query)
 * becomes a top-level node. Inactive zones are included, not filtered
 * (spec: GET /tree shows every zone).
 */
export function buildZoneTree(rows: GeoZoneTreeRow[]): GeoZoneNode[] {
  const nodesById = new Map<string, GeoZoneNode>();
  for (const row of rows) {
    nodesById.set(row.id, {
      id: row.id,
      name: row.name,
      parent_id: row.parent_id,
      level: row.level,
      active: row.active,
      created_at: row.created_at,
      children: [],
    });
  }

  const roots: GeoZoneNode[] = [];
  for (const row of rows) {
    const node = nodesById.get(row.id)!;
    if (row.parent_id !== null && nodesById.has(row.parent_id)) {
      nodesById.get(row.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortTree(roots);
  return roots;
}

function sortTree(nodes: GeoZoneNode[]): void {
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  for (const node of nodes) {
    sortTree(node.children);
  }
}
