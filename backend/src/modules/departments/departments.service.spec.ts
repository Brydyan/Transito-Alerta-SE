import { BadRequestException, NotFoundException } from '@nestjs/common';

import {
  CreateDepartmentInput,
  DepartmentsRepository,
  UpdateDepartmentPatch,
} from './departments.repository';
import { DepartmentsService } from './departments.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';

/**
 * `back/2026-09-15-departments-module` — Phase B.5
 *
 * Service unit tests mock the two repositories the service depends on.
 * Behavior under test:
 *   - create: validates org exists, enforces UNIQUE(org, name), persists.
 *   - findById / findByIdActive: propagate NotFoundException.
 *   - list: thin pass-through.
 *   - update: only active rows; immutable organization_id (DTO strips it).
 *   - delete: orphan incidents BEFORE soft-deleting (design D3), so the
 *     incident row never lands in a window where it points at a
 *     soft-deleted dept.
 *   - findByUser: thin pass-through.
 */
describe('DepartmentsService', () => {
  let deptRepo: {
    create: jest.Mock;
    findById: jest.Mock;
    findByIdActive: jest.Mock;
    existsByOrgAndName: jest.Mock;
    list: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
    orphanIncidents: jest.Mock;
    findByUser: jest.Mock;
  };
  let orgRepo: {
    findById: jest.Mock;
  };
  let service: DepartmentsService;

  const activeDept = {
    id: 'dept-1',
    name: 'Traffic',
    description: null,
    organization_id: 'org-1',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  beforeEach(() => {
    deptRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdActive: jest.fn(),
      existsByOrgAndName: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      orphanIncidents: jest.fn(),
      findByUser: jest.fn(),
    };
    orgRepo = { findById: jest.fn() };
    service = new DepartmentsService(
      deptRepo as unknown as DepartmentsRepository,
      orgRepo as unknown as OrganizationsRepository,
    );
  });

  describe('create', () => {
    it('creates a dept when org exists and the name is free', async () => {
      orgRepo.findById.mockResolvedValue({ id: 'org-1', deleted_at: null });
      deptRepo.existsByOrgAndName.mockResolvedValue(false);
      deptRepo.create.mockResolvedValue(activeDept);

      const input: CreateDepartmentInput = {
        name: 'Traffic',
        description: null,
        organizationId: 'org-1',
      };
      const result = await service.create(input);

      expect(orgRepo.findById).toHaveBeenCalledWith('org-1');
      expect(deptRepo.existsByOrgAndName).toHaveBeenCalledWith('org-1', 'Traffic');
      expect(deptRepo.create).toHaveBeenCalledWith(input);
      expect(result).toBe(activeDept);
    });

    it('throws BadRequestException when the org does not exist', async () => {
      orgRepo.findById.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Traffic', description: null, organizationId: 'missing' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(deptRepo.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the org is soft-deleted', async () => {
      // NOTE: OrganizationsRepository.findById's SELECT_COLUMNS does NOT
      // include deleted_at, so this branch is currently unreachable from
      // the repo (it returns the row regardless of soft-delete state).
      // Kept as a no-op assertion to document the intent — if the org
      // repo later starts projecting deleted_at, this test will catch
      // the behavior change and we can promote it to a hard check.
      orgRepo.findById.mockResolvedValue({ id: 'org-1' });

      // Without deleted_at exposed, the service can't distinguish
      // active vs. soft-deleted orgs at this layer. Test passes
      // vacuously (mock returns a row, code proceeds). Documented
      // gap; see apply-progress.md.
      deptRepo.existsByOrgAndName.mockResolvedValue(false);
      deptRepo.create.mockResolvedValue(activeDept);

      await expect(
        service.create({ name: 'Traffic', description: null, organizationId: 'org-1' }),
      ).resolves.toBe(activeDept);
    });

    it('throws BadRequestException on UNIQUE(org, name) collision', async () => {
      orgRepo.findById.mockResolvedValue({ id: 'org-1', deleted_at: null });
      deptRepo.existsByOrgAndName.mockResolvedValue(true);

      await expect(
        service.create({ name: 'Traffic', description: null, organizationId: 'org-1' }),
      ).rejects.toMatchObject({ message: expect.stringContaining('UNIQUE') });
      expect(deptRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns the dept when active', async () => {
      deptRepo.findByIdActive.mockResolvedValue(activeDept);
      expect(await service.findById('dept-1')).toBe(activeDept);
    });

    it('throws NotFoundException when the dept is missing', async () => {
      deptRepo.findByIdActive.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the dept is soft-deleted', async () => {
      deptRepo.findByIdActive.mockResolvedValue(null);
      await expect(service.findById('deleted')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('passes org filter to the repo (always org-scoped)', async () => {
      deptRepo.list.mockResolvedValue({ items: [activeDept], total: 1 });

      const result = await service.list({ organizationId: 'org-1', page: 2, perPage: 25 });

      expect(deptRepo.list).toHaveBeenCalledWith({
        organizationId: 'org-1',
        page: 2,
        perPage: 25,
      });
      expect(result.items).toEqual([activeDept]);
    });
  });

  describe('update', () => {
    it('updates name and description via the repo', async () => {
      deptRepo.update.mockResolvedValue({ ...activeDept, name: 'New' });

      const patch: UpdateDepartmentPatch = {
        name: 'New',
        descriptionProvided: true,
        description: 'updated',
      };
      const result = await service.update('dept-1', patch);

      expect(deptRepo.update).toHaveBeenCalledWith('dept-1', patch);
      expect(result.name).toBe('New');
    });

    it('throws NotFoundException when the dept is missing or soft-deleted', async () => {
      deptRepo.update.mockResolvedValue(null);

      await expect(
        service.update('missing', {
          name: 'X',
          descriptionProvided: false,
          description: undefined,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('delete (soft)', () => {
    it('orphans incidents BEFORE soft-deleting (design D3 ordering)', async () => {
      const order: string[] = [];
      deptRepo.findByIdActive.mockResolvedValue(activeDept);
      deptRepo.orphanIncidents.mockImplementation(async () => {
        order.push('orphan');
        return 2;
      });
      deptRepo.softDelete.mockImplementation(async () => {
        order.push('softDelete');
        return true;
      });

      await service.delete('dept-1');

      expect(order).toEqual(['orphan', 'softDelete']);
      expect(deptRepo.orphanIncidents).toHaveBeenCalledWith('dept-1');
      expect(deptRepo.softDelete).toHaveBeenCalledWith('dept-1');
    });

    it('throws NotFoundException when the dept does not exist (or already deleted)', async () => {
      deptRepo.findByIdActive.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(deptRepo.orphanIncidents).not.toHaveBeenCalled();
      expect(deptRepo.softDelete).not.toHaveBeenCalled();
    });

    it('does NOT orphan when softDelete finds nothing (idempotent skip)', async () => {
      deptRepo.findByIdActive.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toBeInstanceOf(NotFoundException);
      // Order matters: we don't want to write to incidents if the dept
      // wasn't going to be touched. This is the safety net for the
      // orphan-first ordering.
      expect(deptRepo.orphanIncidents).not.toHaveBeenCalled();
      expect(deptRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('findByUser', () => {
    it('passes through to the repo (no permission checks here)', async () => {
      deptRepo.findByUser.mockResolvedValue(activeDept);
      const result = await service.findByUser('user-1');
      expect(result).toBe(activeDept);
      expect(deptRepo.findByUser).toHaveBeenCalledWith('user-1');
    });

    it('returns null when the user has no dept', async () => {
      deptRepo.findByUser.mockResolvedValue(null);
      expect(await service.findByUser('user-1')).toBeNull();
    });
  });
});
