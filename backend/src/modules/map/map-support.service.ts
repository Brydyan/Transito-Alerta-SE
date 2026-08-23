import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { CategoryDto } from './dto/category.dto';
import { MapFiltersResponseDto } from './dto/map-filters-response.dto';

/**
 * T5.4 — MapSupportService.
 * Read-only catalog queries for the map UI. No org scope (incident
 * categories are global in the NestJS schema — D2 in the design).
 */
@Injectable()
export class MapSupportService {
  constructor(
    @InjectRepository(IncidentCategoryEntity)
    private readonly categoryRepo: Repository<IncidentCategoryEntity>,
  ) {}

  async getMapFilters(): Promise<MapFiltersResponseDto> {
    const rows = await this.categoryRepo.find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });
    const categories: CategoryDto[] = rows.map((r) => ({ id: r.id, name: r.name }));
    return { data: { categories } };
  }
}
