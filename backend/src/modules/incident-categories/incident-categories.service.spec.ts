import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { IncidentCategoriesRepository } from './incident-categories.repository';
import { IncidentCategoriesService } from './incident-categories.service';

function makeCategory(overrides: Partial<IncidentCategoryEntity> = {}): IncidentCategoryEntity {
  return {
    id: 'cat-1',
    name: 'Traffic',
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('IncidentCategoriesService', () => {
  let categoryRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let categoriesRepository: { getSubtree: jest.Mock; validateNoCycles: jest.Mock };
  let qb: {
    orderBy: jest.Mock;
    andWhere: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };
  let service: IncidentCategoriesService;

  beforeEach(() => {
    qb = {
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };
    categoryRepo = {
      create: jest.fn((input) => input),
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    categoriesRepository = {
      getSubtree: jest.fn(),
      validateNoCycles: jest.fn(),
    };
    service = new IncidentCategoriesService(
      categoryRepo as unknown as Repository<IncidentCategoryEntity>,
      categoriesRepository as unknown as IncidentCategoriesRepository,
    );
  });

  describe('create', () => {
    it('creates a root category without checking cycles or parent existence', async () => {
      categoryRepo.save.mockResolvedValue(makeCategory({ parentId: null }));

      const result = await service.create({ name: 'Traffic' });

      expect(categoriesRepository.validateNoCycles).not.toHaveBeenCalled();
      expect(categoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Traffic', parentId: null }),
      );
      expect(result.name).toBe('Traffic');
    });

    it('validates parent existence and cycle guard when parent_id is provided', async () => {
      categoryRepo.findOne.mockResolvedValue(makeCategory({ id: 'parent-1' }));
      categoriesRepository.validateNoCycles.mockResolvedValue(true);
      categoryRepo.save.mockResolvedValue(makeCategory({ parentId: 'parent-1' }));

      await service.create({ name: 'Accident', parent_id: 'parent-1' });

      expect(categoryRepo.findOne).toHaveBeenCalledWith({ where: { id: 'parent-1' } });
      expect(categoriesRepository.validateNoCycles).toHaveBeenCalledWith(null, 'parent-1');
      expect(categoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: 'parent-1' }),
      );
    });

    it('throws BadRequestException when parent_id does not reference an existing category', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Accident', parent_id: 'missing' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(categoryRepo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the cycle guard rejects the proposed parent', async () => {
      categoryRepo.findOne.mockResolvedValue(makeCategory({ id: 'parent-1' }));
      categoriesRepository.validateNoCycles.mockResolvedValue(false);

      await expect(
        service.create({ name: 'Accident', parent_id: 'parent-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(categoryRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('validates the cycle guard, passing the target category id, before saving', async () => {
      categoryRepo.findOne
        .mockResolvedValueOnce(makeCategory({ id: 'A' })) // findById(existing)
        .mockResolvedValueOnce(makeCategory({ id: 'C' })); // parent existence check
      categoriesRepository.validateNoCycles.mockResolvedValue(true);
      categoryRepo.save.mockResolvedValue(makeCategory({ id: 'A', parentId: 'C' }));

      await service.update('A', { parent_id: 'C' });

      expect(categoriesRepository.validateNoCycles).toHaveBeenCalledWith('A', 'C');
    });

    it('throws BadRequestException when re-parenting would create a cycle', async () => {
      categoryRepo.findOne
        .mockResolvedValueOnce(makeCategory({ id: 'A' }))
        .mockResolvedValueOnce(makeCategory({ id: 'C' }));
      categoriesRepository.validateNoCycles.mockResolvedValue(false);

      await expect(service.update('A', { parent_id: 'C' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(categoryRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the category does not exist', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('deletes the category when it exists and nothing references it', async () => {
      categoryRepo.findOne.mockResolvedValue(makeCategory());
      categoryRepo.delete.mockResolvedValue(undefined);

      await service.delete('cat-1');

      expect(categoryRepo.delete).toHaveBeenCalledWith('cat-1');
    });

    it('throws NotFoundException when the category does not exist', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(categoryRepo.delete).not.toHaveBeenCalled();
    });

    it('maps a PG foreign-key violation (23503) to ConflictException (409)', async () => {
      categoryRepo.findOne.mockResolvedValue(makeCategory());
      categoryRepo.delete.mockRejectedValue({ code: '23503' });

      await expect(service.delete('cat-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows unrelated errors unchanged', async () => {
      categoryRepo.findOne.mockResolvedValue(makeCategory());
      const unrelated = new Error('boom');
      categoryRepo.delete.mockRejectedValue(unrelated);

      await expect(service.delete('cat-1')).rejects.toBe(unrelated);
    });
  });

  describe('findById', () => {
    it('returns the category when found', async () => {
      categoryRepo.findOne.mockResolvedValue(makeCategory());

      const result = await service.findById('cat-1');

      expect(result.id).toBe('cat-1');
    });

    it('throws NotFoundException when missing', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('applies search and parentId filters, paginating with default page size', async () => {
      qb.getManyAndCount.mockResolvedValue([[makeCategory()], 1]);

      const result = await service.list({ search: 'Inci', parentId: 'root-1' });

      expect(qb.andWhere).toHaveBeenCalledWith('c.name ILIKE :search', { search: '%Inci%' });
      expect(qb.andWhere).toHaveBeenCalledWith('c.parent_id = :parentId', { parentId: 'root-1' });
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('filters to roots only when parentId is explicitly null', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.list({ parentId: null });

      expect(qb.andWhere).toHaveBeenCalledWith('c.parent_id IS NULL');
    });
  });

  describe('getTree', () => {
    it('delegates to categoriesRepository.getSubtree(null)', async () => {
      categoriesRepository.getSubtree.mockResolvedValue([]);

      await service.getTree();

      expect(categoriesRepository.getSubtree).toHaveBeenCalledWith(null);
    });
  });
});
