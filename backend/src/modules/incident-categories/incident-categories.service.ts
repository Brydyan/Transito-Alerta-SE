import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { CreateIncidentCategoryDto } from './dto/create-incident-category.dto';
import { UpdateIncidentCategoryDto } from './dto/update-incident-category.dto';
import { CategoryNode, IncidentCategoriesRepository } from './incident-categories.repository';

export const DEFAULT_PAGE_SIZE = 15;
export const MAX_PAGE_SIZE = 100;

export interface ListFilters {
  search?: string;
  /** `undefined` = no filter. `null` = roots only (parent_id IS NULL). */
  parentId?: string | null;
  page?: number;
  perPage?: number;
}

export interface ListResult {
  items: IncidentCategoryEntity[];
  total: number;
}

/**
 * IncidentCategoriesService (T3.7, design D1) — `@InjectRepository` for
 * flat CRUD (majority pattern: Comments/Users/Roles/Notifications), plus
 * IncidentCategoriesRepository only for the tree read and the ancestor-walk
 * cycle guard (D4). Cycle/parent-existence checks return a domain 400
 * (BadRequestException) per spec.
 *
 * T7.2.C3 (R7.3): `delete()` is a soft delete — the old hard `DELETE` could
 * hit a PG 23503 foreign-key violation when incidents still referenced the
 * category (mapped to 409); an `UPDATE ... SET deleted_at` never removes
 * the row, so that failure mode no longer exists.
 */
@Injectable()
export class IncidentCategoriesService {
  constructor(
    @InjectRepository(IncidentCategoryEntity)
    private readonly categoryRepo: Repository<IncidentCategoryEntity>,
    private readonly categoriesRepository: IncidentCategoriesRepository,
  ) {}

  async create(dto: CreateIncidentCategoryDto): Promise<IncidentCategoryEntity> {
    const parentId = dto.parent_id ?? null;
    await this.assertValidParent(null, parentId);

    const entity = this.categoryRepo.create({ name: dto.name, parentId });
    return this.categoryRepo.save(entity);
  }

  async update(id: string, dto: UpdateIncidentCategoryDto): Promise<IncidentCategoryEntity> {
    const existing = await this.findById(id);

    if (dto.parent_id !== undefined) {
      await this.assertValidParent(id, dto.parent_id);
      existing.parentId = dto.parent_id;
    }
    if (dto.name !== undefined) {
      existing.name = dto.name;
    }

    return this.categoryRepo.save(existing);
  }

  /**
   * T7.2.B2/C3 — soft delete (R7.3), never a hard DELETE. Since the row
   * never actually leaves the table, this can no longer hit the PG
   * foreign-key violation a real DELETE used to (a category referenced by
   * existing incidents is simply left alone by the UPDATE, still
   * resolvable via its `incident_category_id` FK) — idempotent by
   * construction, re-soft-deleting just re-stamps `deletedAt`.
   */
  async delete(id: string): Promise<void> {
    const category = await this.findById(id);
    category.deletedAt = new Date();
    await this.categoryRepo.save(category);
  }

  async findById(id: string): Promise<IncidentCategoryEntity> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async list(filters: ListFilters = {}): Promise<ListResult> {
    const perPage = Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(filters.page ?? 1, 1);
    const skip = (page - 1) * perPage;

    // T7.2.B2/R7.3 — soft-deleted categories never appear in the list.
    const qb = this.categoryRepo
      .createQueryBuilder('c')
      .orderBy('c.name', 'ASC')
      .andWhere('c.deleted_at IS NULL');

    if (filters.search) {
      qb.andWhere('c.name ILIKE :search', { search: `%${filters.search}%` });
    }
    if (filters.parentId === null) {
      qb.andWhere('c.parent_id IS NULL');
    } else if (filters.parentId !== undefined) {
      qb.andWhere('c.parent_id = :parentId', { parentId: filters.parentId });
    }

    qb.skip(skip).take(perPage);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  getTree(): Promise<CategoryNode[]> {
    return this.categoriesRepository.getSubtree(null);
  }

  /**
   * Validates a proposed parent per spec: it must reference an existing
   * category (400 "Parent category not found") and must not create a
   * cycle (400 "Circular reference detected", design D4). `null` (root
   * assignment) is always valid and short-circuits both checks.
   */
  private async assertValidParent(
    categoryId: string | null,
    parentId: string | null | undefined,
  ): Promise<void> {
    if (parentId === null || parentId === undefined) {
      return;
    }

    const parent = await this.categoryRepo.findOne({ where: { id: parentId } });
    if (!parent) {
      throw new BadRequestException('Parent category not found');
    }

    const isValid = await this.categoriesRepository.validateNoCycles(categoryId, parentId);
    if (!isValid) {
      throw new BadRequestException('Circular reference detected');
    }
  }
}
