import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { ALL_ZONES_TAG, GeofencingService } from '../geofencing/geofencing.service';
import { GEO_ZONE_LEVELS, GeoZoneLevel } from '../../entities/geo-zone.entity';
import { CreateGeoZoneDto } from './dto/create-geo-zone.dto';
import { UpdateGeoZoneDto } from './dto/update-geo-zone.dto';
import {
  GeoZoneDetailRow,
  GeoZoneNode,
  GeoZonesRepository,
  ListFilters,
} from './geo-zones.repository';

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
@Injectable()
export class GeoZonesService {
  constructor(
    private readonly repo: GeoZonesRepository,
    private readonly geofencing: GeofencingService,
  ) {}

  async create(dto: CreateGeoZoneDto): Promise<GeoZoneDetailRow> {
    const level = dto.level ?? 'zona';
    const parentId = dto.parent_id ?? null;

    await this.assertValidParent(null, parentId, level);
    await this.assertValidGeometry(dto.polygon);

    const zone = await this.repo.create({
      name: dto.name,
      parentId,
      level,
      active: dto.active ?? true,
      polygon: dto.polygon,
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
