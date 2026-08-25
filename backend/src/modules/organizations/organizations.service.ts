import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { OrganizationEntity } from '../../entities/organization.entity';
import { GeoZoneEntity } from '../../entities/geo-zone.entity';
import { GeofencingService } from '../geofencing/geofencing.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ListFilters, OrganizationRow, OrganizationsRepository } from './organizations.repository';
import { NotifiedForQueryDto } from './dto/notified-for-query.dto';

export interface OrganizationWithClaimable extends OrganizationRow {
  is_claimable: boolean;
}

export interface ListResult {
  items: OrganizationRow[];
  total: number;
}

export interface OrganizationTreeNode {
  id: string;
  name: string;
  zoneId: string | null;
  children: OrganizationTreeNode[];
}

export interface OrganizationFormData {
  roles: Array<{ id: string; name: string }>;
  geoZones: Array<{ id: string; name: string }>;
}

/**
 * OrganizationsService (T3.2 design D8) — mirrors GeoZonesService's CRUD
 * shape. Zone rooms are not scoped resources, so this module takes no
 * `scope` parameter itself.
 *
 * T7.5 (design D7 — behavioural fix): `uq_organizations_zone` is gone
 * (migration 0034) — several orgs at different levels of the location
 * tree can now share a `zone_id`, all eligible for notification.
 * `findNotifiedFor` replaces `findByZone`: `IncidentsService.create`
 * (org derivation on write, design D4) now takes `findNotifiedFor(...)[0]`
 * as its "primary" org, same criterion `notifiedFor()` uses for
 * `is_claimable` — so the two never disagree.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repo: OrganizationsRepository,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @InjectRepository(GeoZoneEntity)
    private readonly geoZoneRepo: Repository<GeoZoneEntity>,
    private readonly geofencingService: GeofencingService,
  ) {}

  create(dto: CreateOrganizationDto): Promise<OrganizationRow> {
    return this.repo.create({ name: dto.name, zoneId: dto.zone_id ?? null, parentId: dto.parent_id ?? null });
  }

  /**
   * T7.5.B3 — a direct cycle (`parent_id = own id`) is rejected by the DB
   * CHECK; an indirect cycle (A→B→A) is not expressible as a CHECK, so it's
   * validated here by walking the candidate parent's ancestor chain before
   * the write.
   */
  async update(id: string, dto: UpdateOrganizationDto): Promise<OrganizationRow> {
    if (dto.parent_id) {
      await this.assertNoCycle(id, dto.parent_id);
    }

    const updated = await this.repo.update(id, {
      name: dto.name,
      zoneIdProvided: dto.zone_id !== undefined,
      zoneId: dto.zone_id,
      parentIdProvided: dto.parent_id !== undefined,
      parentId: dto.parent_id,
    });
    if (!updated) {
      throw new NotFoundException('Organization not found');
    }
    return updated;
  }

  private async assertNoCycle(orgId: string, candidateParentId: string): Promise<void> {
    let currentId: string | null = candidateParentId;
    const visited = new Set<string>();
    while (currentId) {
      if (currentId === orgId) {
        throw new BadRequestException('parent_id would create a cycle in the organization tree');
      }
      if (visited.has(currentId)) break; // pre-existing cycle elsewhere — not this call's problem
      visited.add(currentId);
      const current = await this.repo.findById(currentId);
      currentId = current?.parent_id ?? null;
    }
  }

  /** T7.5.C6 — admin-only routing category assignment. */
  async assignCategory(id: string, incidentCategoryId: string | null): Promise<OrganizationRow> {
    const updated = await this.repo.updateCategory(id, incidentCategoryId);
    if (!updated) {
      throw new NotFoundException('Organization not found');
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.repo.delete(id);
  }

  async findById(id: string): Promise<OrganizationRow> {
    const org = await this.repo.findById(id);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  list(filters: ListFilters = {}): Promise<ListResult> {
    return this.repo.findAll(filters);
  }

  /**
   * T7.5.C — legacy `findForLocation()` / `findNotifiedFor()` unified: a
   * `null` zoneId (incident outside every zone) short-circuits to `[]`
   * without a query (design D4: "outside every zone, or the zone has no
   * org"). `categoryId = null` still matches transversal orgs.
   */
  findNotifiedFor(zoneId: string | null, categoryId: string | null): Promise<OrganizationRow[]> {
    if (zoneId === null) {
      return Promise.resolve([]);
    }
    return this.repo.findNotifiedFor(zoneId, categoryId);
  }

  // ---- T5.6 extras: tree / formData / notifiedFor

  /**
   * T7.5.B2 — nested tree built from `parent_id` (replaces the flat list
   * T3.2/T5.6 shipped, and its "no hierarchy" limitation comment — see
   * design D8). Orgs with a `parent_id` that isn't in the result set
   * (e.g. pointing at a soft-deleted org) are treated as roots rather than
   * silently dropped.
   */
  async tree(): Promise<OrganizationTreeNode[]> {
    const orgs = await this.orgRepo.find({ where: { deletedAt: IsNull() }, order: { name: 'ASC' } });
    const nodes = new Map<string, OrganizationTreeNode>();
    for (const o of orgs) {
      nodes.set(o.id, { id: o.id, name: o.name, zoneId: o.zoneId, children: [] });
    }

    const roots: OrganizationTreeNode[] = [];
    for (const o of orgs) {
      const node = nodes.get(o.id)!;
      const parent = o.parentId ? nodes.get(o.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  /**
   * T5.6 — reference data for the organization-management form.
   * Returns the catalog of roles + geo-zones the admin can pick from
   * when creating a new org.
   */
  async formData(): Promise<OrganizationFormData> {
    const roles = await this.orgRepo.manager.find('RoleEntity' as never, {
      select: ['id', 'name'],
      order: { name: 'ASC' },
    } as never) as Array<{ id: string; name: string }>;
    const geoZones = await this.geoZoneRepo.find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });
    return {
      roles,
      geoZones: geoZones.map((z) => ({ id: z.id, name: z.name })),
    };
  }

  /**
   * T6.1.B — dual-input: GPS coordinates OR location_id (zone UUID).
   * If location_id is provided → direct zone lookup by ID (no geofencing).
   * If lat+lng are provided → existing geofencing path.
   * Otherwise → BadRequestException (at least one group required).
   *
   * T7.5.C3 (design D7 — behavioural fix, not just a schema gap) —
   * `notifiedFor` now resolves BOTH ancestries (location + category) via
   * `findNotifiedFor`, returns every matching org (not "at most one"), and
   * `is_claimable` is identity with the org the auto-assign would pick —
   * the first in the stable `(created_at, id)` order — not
   * `max_active_claims > 0`.
   */
  async notifiedFor(query: NotifiedForQueryDto): Promise<OrganizationWithClaimable[]> {
    let zoneId: string | null = null;

    if (query.location_id) {
      // Grupo B: direct lookup by zone ID
      zoneId = query.location_id;
    } else if (query.lat !== undefined && query.lng !== undefined) {
      // Grupo A: geofencing
      const { zone } = await this.geofencingService.resolveZone({ lat: query.lat, lng: query.lng });
      zoneId = zone?.id ?? null;
    } else {
      throw new BadRequestException('Provide lat+lng or location_id');
    }

    if (!zoneId) return [];
    const orgs = await this.repo.findNotifiedFor(zoneId, query.category_id ?? null);

    return orgs.map((org, index) => ({ ...org, is_claimable: index === 0 }));
  }
}
