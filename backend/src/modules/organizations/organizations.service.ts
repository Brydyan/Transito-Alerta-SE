import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
}

export interface OrganizationFormData {
  roles: Array<{ id: string; name: string }>;
  geoZones: Array<{ id: string; name: string }>;
}

/**
 * OrganizationsService (T3.2 design D8) — mirrors GeoZonesService's CRUD
 * shape. `findByZone` returns the single org or `null`, relying on the
 * partial UNIQUE index for determinism (migration 0015). Zone rooms are
 * not scoped resources, so this module takes no `scope` parameter itself
 * — its only consumer needing scope-awareness is `IncidentsService.create`
 * (org derivation on write, design D4), which calls `findByZone` only.
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
    return this.repo.create({ name: dto.name, zoneId: dto.zone_id ?? null });
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<OrganizationRow> {
    const updated = await this.repo.update(id, {
      name: dto.name,
      zoneIdProvided: dto.zone_id !== undefined,
      zoneId: dto.zone_id,
    });
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
   * `null` zoneId (incident outside every zone) is not a repository
   * lookup — it always resolves to `null` (design D4: "outside every
   * zone, or the zone has no org").
   */
  findByZone(zoneId: string | null): Promise<OrganizationRow | null> {
    if (zoneId === null) {
      return Promise.resolve(null);
    }
    return this.repo.findByZone(zoneId);
  }

  // ---- T5.6 extras: tree / formData / notifiedFor

  /**
   * T5.6 — flat list of all organizations. The `organizations` table
   * has no `parent_id` column (T3.2 decision; the geo-zones table is the
   * actual admin hierarchy — see `1-BACKEND-MIGRATIONS.md`). Returned
   * as a flat list; the frontend can build a tree view client-side.
   */
  async tree(): Promise<OrganizationTreeNode[]> {
    const orgs = await this.orgRepo.find({ order: { name: 'ASC' } });
    return orgs.map((o) => ({ id: o.id, name: o.name, zoneId: o.zoneId }));
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
   * Returns is_claimable: org.max_active_claims > 0.
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
    const org = await this.repo.findByZone(zoneId);
    if (!org) return [];

    return [{ ...org, is_claimable: org.max_active_claims > 0 }];
  }
}
