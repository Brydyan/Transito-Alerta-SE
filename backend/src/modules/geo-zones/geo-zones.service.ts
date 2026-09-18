import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ALL_ZONES_TAG, GeofencingService } from '../geofencing/geofencing.service';
import { GEO_ZONE_LEVELS, GeoZoneLevel } from '../../entities/geo-zone.entity';
import { CreateGeoZoneDto } from './dto/create-geo-zone.dto';
import { UpdateGeoZoneDto } from './dto/update-geo-zone.dto';
import {
  FormDataRow,
  GeoZoneDetailRow,
  GeoZoneNode,
  GeoZonesRepository,
  ListFilters,
} from './geo-zones.repository';
import { ImportGeoZoneQueryDto } from './dto/import-geo-zone-query.dto';
import { ImportGeoZoneResponse } from './dto/import-geo-zone-response.dto';

export interface ListResult {
  items: GeoZoneDetailRow[];
  total: number;
}

/**
 * The 4-level jurisdiction hierarchy's parent constraint (proposal D6 /
 * design "assertValidParent" table). `null` = must have no parent. `'*'` =
 * unconstrained (any level, or none).
 */
const REQUIRED_PARENT_LEVEL: Record<GeoZoneLevel, GeoZoneLevel | null | '*'> = {
  provincia: null,
  canton: 'provincia',
  parroquia: 'canton',
  zona: '*',
};

/**
 * GeoZonesService (T3.8 design) — CRUD, parent/level guard, geometry
 * guard, purge orchestration. Depends on GeofencingService only for cache
 * invalidation after a boundary change (D9) — GeoZonesModule imports
 * GeofencingModule, never the other way around.
 */
/**
 * Static level labels returned by getFormData (spec R9 — always the four
 * valid levels in display form). Stored here, not in the entity enum, to
 * keep the display strings decoupled from the DB values.
 */
const FORM_DATA_LEVELS = ['cantón', 'parroquia', 'provincia', 'sector'] as const;

@Injectable()
export class GeoZonesService {
  constructor(
    private readonly repo: GeoZonesRepository,
    private readonly geofencing: GeofencingService,
    @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  async create(dto: CreateGeoZoneDto): Promise<GeoZoneDetailRow> {
    const level = dto.level ?? 'zona';
    const parentId = dto.parent_id ?? null;

    await this.assertValidParent(null, parentId, level);
    if (dto.polygon !== undefined) {
      await this.assertValidGeometry(dto.polygon);
    }

    const zone = await this.repo.create({
      name: dto.name,
      parentId,
      level,
      active: dto.active ?? true,
      polygon: dto.polygon ?? null,
      code: dto.code ?? null,
    });

    // Create purges too (D8): a new active polygon may overlap an
    // already-cached zone.
    await this.purgeGeoCaches(zone.id);

    return zone;
  }

  async update(id: string, dto: UpdateGeoZoneDto): Promise<GeoZoneDetailRow> {
    const before = await this.findById(id);

    const effectiveLevel = dto.level ?? before.level;
    if (dto.level !== undefined || dto.parent_id !== undefined) {
      await this.assertValidParent(id, dto.parent_id, effectiveLevel);
    }

    if (dto.polygon !== undefined) {
      await this.assertValidGeometry(dto.polygon);
    }

    const updated = await this.repo.update(id, {
      name: dto.name,
      parentIdProvided: dto.parent_id !== undefined,
      parentId: dto.parent_id,
      level: dto.level,
      active: dto.active,
      polygon: dto.polygon,
      codeProvided: dto.code !== undefined,
      code: dto.code,
    });

    if (!updated) {
      throw new NotFoundException('Zone not found');
    }

    // Purge iff polygon supplied OR active actually flipped (design D8).
    // Rename / level / parent_id changes cannot affect any cached
    // containment or list payload.
    const boundaryChanged = dto.polygon !== undefined;
    const activityChanged = dto.active !== undefined && dto.active !== before.active;
    if (boundaryChanged || activityChanged) {
      await this.purgeGeoCaches(id);
    }

    return updated;
  }

  /** DELETE /:id — soft delete (active=false), idempotent, never a real DELETE. */
  async delete(id: string): Promise<void> {
    await this.findById(id);

    const result = await this.repo.deactivate(id);
    if (!result) {
      throw new NotFoundException('Zone not found');
    }

    if (result.changed) {
      await this.purgeGeoCaches(id);
    }
  }

  /** 200 even when inactive — row existence, not `active`, gates visibility. */
  async findById(id: string): Promise<GeoZoneDetailRow> {
    const zone = await this.repo.findById(id);
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }
    return zone;
  }

  list(filters: ListFilters = {}): Promise<ListResult> {
    return this.repo.findAll(filters);
  }

  /** ALL zones including inactive (spec: GET /tree shows every zone). */
  getTree(): Promise<GeoZoneNode[]> {
    return this.repo.getSubtree(null);
  }

  /**
   * Bulk shapefile import (design D5-D9 / spec R7-R8).
   * Parses the zip buffer with shpjs, runs per-feature validation (D7),
   * inserts valid features inside a single QueryRunner transaction, and
   * purges geo caches on commit.
   *
   * A DB error mid-batch triggers a full rollback (spec R8 last scenario).
   * Per-feature geometry / validation errors are collected and returned
   * without aborting the whole import.
   */
  async importShapefile(
    buffer: Buffer | ArrayBuffer,
    query: Partial<ImportGeoZoneQueryDto> & { level: GeoZoneLevel },
  ): Promise<ImportGeoZoneResponse> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shpjs = require('shpjs') as (b: ArrayBuffer) => Promise<{ type: string; features: Array<{ type: string; geometry: unknown; properties: Record<string, unknown> | null }> }>;

    const nameColumn = query.name_column ?? 'NAME';
    const codeColumn = query.code_column ?? 'CODE';
    const autoParent = query.auto_parent !== false; // default true

    // Parse zip (may throw for non-shapefile content — caller handles 400).
    const ab: ArrayBuffer = buffer instanceof Buffer
      ? (buffer.buffer as ArrayBuffer).slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      : (buffer as ArrayBuffer);
    const collection = await shpjs(ab);
    const features = collection.features ?? [];

    const imported: number[] = [];
    const skipped: Array<{ index: number; name: string }> = [];
    const errors: ImportGeoZoneResponse['errors'] = [];
    const warnings: string[] = [];

    // Track codes seen in this batch to catch intra-batch duplicates.
    const seenCodes = new Set<string>();

    const ds = this.dataSource;
    if (!ds) {
      throw new Error('DataSource not injected — cannot manage transaction');
    }
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const rawName = props[nameColumn] ?? props['nombre'] ?? props['NOMBRE'] ?? '';
        const name = String(rawName ?? '').trim();
        const code: string | null = props[codeColumn] != null ? String(props[codeColumn]).trim() : null;

        // Validation: name required.
        if (!name) {
          errors.push({ index: i, name: `feature[${i}]`, reason: 'name is required' });
          continue;
        }

        // Validation: name length.
        if (name.length > 255) {
          errors.push({ index: i, name: name.slice(0, 40), reason: 'name exceeds 255 characters' });
          continue;
        }

        // Validation: code length.
        if (code !== null && code.length > 32) {
          errors.push({ index: i, name, reason: 'code exceeds 32 characters' });
          continue;
        }

        // Duplicate code check: DB then intra-batch.
        if (code !== null) {
          if (seenCodes.has(code)) {
            skipped.push({ index: i, name });
            continue;
          }
          const existing = await this.repo.findByCode(code);
          if (existing) {
            skipped.push({ index: i, name });
            continue;
          }
          seenCodes.add(code);
        }

        // Geometry validation via PostGIS.
        let geometryCheck;
        try {
          geometryCheck = await this.repo.validateGeometry(feature.geometry);
        } catch {
          errors.push({ index: i, name, reason: 'Invalid GeoJSON geometry' });
          continue;
        }

        if (!geometryCheck.valid) {
          errors.push({ index: i, name, reason: `Invalid geometry: ${geometryCheck.reason ?? 'unknown'}` });
          continue;
        }
        if (geometryCheck.inBounds === false) {
          errors.push({ index: i, name, reason: 'Geometry outside Ecuador bounds' });
          continue;
        }

        // Parent resolution.
        let parentId: string | null = null;
        if (autoParent) {
          const parentCode = props['parent_code'] != null ? String(props['parent_code']) : null;
          if (parentCode) {
            const parent = await this.repo.findByCode(parentCode);
            if (parent) {
              parentId = parent.id;
            }
          }
          if (parentId === null) {
            const parent = await this.repo.findParentBySpatialContainment(feature.geometry);
            if (parent) {
              parentId = parent.id;
            } else {
              warnings.push(`Zone '${name}' imported without parent (no match found)`);
            }
          }
        }

        await this.repo.createInTransaction(qr, {
          name,
          parentId,
          level: query.level,
          active: true,
          polygon: feature.geometry as import('./geo-zones.repository').GeoJsonGeometry | null,
          code,
        });

        imported.push(i);
      }

      await qr.commitTransaction();
      await this.purgeGeoCaches('__import__');

    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    return {
      imported: imported.length,
      skipped: skipped.length,
      errors,
      warnings,
    };
  }

  /**
   * Returns form-data for the import dialog (design D10 / spec R9):
   * static levels array + all active zone rows sorted by level, name.
   */
  async getFormData(): Promise<{ levels: readonly string[]; parents: FormDataRow[] }> {
    const parents = await this.repo.getFormData();
    return { levels: FORM_DATA_LEVELS, parents };
  }

  /**
   * Validates a proposed parent (order: parent exists -> level compatible
   * -> no cycle). `undefined` parent_id on update means "leave unchanged" —
   * callers only invoke this when parent_id or level actually changed.
   */
  private async assertValidParent(
    zoneId: string | null,
    parentId: string | null | undefined,
    level: GeoZoneLevel,
  ): Promise<void> {
    const required = REQUIRED_PARENT_LEVEL[level];

    if (parentId === null || parentId === undefined) {
      if (required !== null && required !== '*') {
        throw new BadRequestException(
          `Invalid parent level: a ${level} must have a ${required} parent`,
        );
      }
      return;
    }

    if (required === null) {
      throw new BadRequestException('Invalid parent level: a provincia cannot have a parent');
    }

    const parentLevel = await this.repo.findParentLevel(parentId);
    if (parentLevel === null) {
      throw new BadRequestException('Parent zone not found');
    }

    if (required !== '*' && parentLevel !== required) {
      throw new BadRequestException(
        `Invalid parent level: a ${level} must have a ${required} parent`,
      );
    }

    const noCycle = await this.repo.validateNoCycles(zoneId, parentId);
    if (!noCycle) {
      throw new BadRequestException('Circular reference detected');
    }
  }

  private async assertValidGeometry(polygon: unknown): Promise<void> {
    let check;
    try {
      check = await this.repo.validateGeometry(polygon);
    } catch {
      throw new BadRequestException('Invalid GeoJSON geometry');
    }

    if (check.geom_type !== 'ST_MultiPolygon') {
      throw new BadRequestException('polygon must resolve to a Polygon or MultiPolygon');
    }
    if (!check.valid) {
      throw new BadRequestException(`Invalid geometry: ${check.reason ?? 'unknown reason'}`);
    }
    if (check.empty) {
      throw new BadRequestException('Geometry is empty');
    }
    // sc-323-f6 (D3): polygon must be plausibly within Ecuador (±500 km from
    // the country's centroid). Rejects a Peru shapefile uploaded by mistake
    // before it ever becomes a row in geo_zones.
    if (check.inBounds === false) {
      throw new BadRequestException(
        'Geometry outside Ecuador bounds — centroid must lie within 500 km of (-78.5, -1.5)',
      );
    }
  }

  /**
   * D9 purge order, awaited, post-commit: zone-scoped tag -> the
   * cross-cutting incident-list tag -> the point-containment cache.
   */
  private async purgeGeoCaches(zoneId: string): Promise<void> {
    await this.geofencing.purgeZoneCache(zoneId);
    await this.geofencing.purgeZoneCache(ALL_ZONES_TAG);
    await this.geofencing.purgePointCache();
  }
}

// Re-exported for the DTO's @IsIn (single source of truth, entity file).
export { GEO_ZONE_LEVELS };
