import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { CreateIncidentCategoryDto } from './dto/create-incident-category.dto';
import { UpdateIncidentCategoryDto } from './dto/update-incident-category.dto';
import { CategoryNode, IncidentCategoriesRepository } from './incident-categories.repository';

export const DEFAULT_PAGE_SIZE = 15;
export const MAX_PAGE_SIZE = 100;

const PG_FOREIGN_KEY_VIOLATION = '23503';

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
 * (BadRequestException) per spec — 409 is reserved for the delete-time PG
 * foreign-key violation (D6), a different failure mode entirely.
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

  async delete(id: string): Promise<void> {
    await this.findById(id);

    try {
      await this.categoryRepo.delete(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Cannot delete category: it is referenced by existing incidents',
        );
      }
      throw error;
    }
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

    const qb = this.categoryRepo.createQueryBuilder('c').orderBy('c.name', 'ASC');

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

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === PG_FOREIGN_KEY_VIOLATION
  );
}
