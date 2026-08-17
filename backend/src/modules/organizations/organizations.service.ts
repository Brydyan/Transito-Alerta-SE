import { Injectable, NotFoundException } from '@nestjs/common';

import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ListFilters, OrganizationRow, OrganizationsRepository } from './organizations.repository';

export interface ListResult {
  items: OrganizationRow[];
  total: number;
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
  constructor(private readonly repo: OrganizationsRepository) {}

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
}
