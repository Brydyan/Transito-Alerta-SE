import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';

const activeDept = {
  id: 'dept-1',
  name: 'Traffic',
  description: null,
  organization_id: 'org-1',
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

/**
 * `back/2026-09-15-departments-module` — Phase C.3
 *
 * Controller spec: instantiate the controller directly with a mocked
 * service, exercise each handler, and use `Reflector` to assert the
 * `@RequirePermission` metadata (the `PermissionGuard` itself is tested
 * in `permission.guard.spec.ts`; we only verify this controller emits
 * the metadata it should).
 *
 * Scope matrix:
 *   master / operador_sistema → bypass org-scope checks (see all)
 *   admin_org → caller's `organizationId` MUST equal `dept.organization_id`
 *   any other role with an org → same as admin_org
 *   any other role WITHOUT an org → 403 (no fallback to "see all")
 */
describe('DepartmentsController', () => {
  let service: {
    list: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let controller: DepartmentsController;
  let reflector: Reflector;

  beforeEach(() => {
    service = {
      list: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    controller = new DepartmentsController(service as unknown as DepartmentsService);
    reflector = new Reflector();
  });

  const buildReq = (overrides: Partial<AuthenticatedRequest['user']>): AuthenticatedRequest => {
    const baseUser = {
      userId: 'user-1',
      permissions: [],
      organizationId: 'org-1',
      roleName: 'admin_org',
      scope: { kind: 'org' as const, organizationId: 'org-1' },
      sessionId: 'sess-1',
      isAnonymous: false,
    };
    return {
      user: { ...baseUser, ...overrides },
    } as unknown as AuthenticatedRequest;
  };

  describe('@RequirePermission metadata', () => {
    it('GET / requires READ on departments', () => {
      const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.list);
      expect(meta).toEqual({ action: 'READ', resource: 'departments' });
    });

    it('POST / requires CREATE on departments', () => {
      const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.create);
      expect(meta).toEqual({ action: 'CREATE', resource: 'departments' });
    });

    it('GET /:id requires READ on departments', () => {
      const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.findOne);
      expect(meta).toEqual({ action: 'READ', resource: 'departments' });
    });

    it('PATCH /:id requires UPDATE on departments', () => {
      const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.update);
      expect(meta).toEqual({ action: 'UPDATE', resource: 'departments' });
    });

    it('DELETE /:id requires DELETE on departments', () => {
      const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.remove);
      expect(meta).toEqual({ action: 'DELETE', resource: 'departments' });
    });
  });

  describe('list (GET /)', () => {
    it('admin_org: forces org filter to the caller\'s org (ignores query.organizationId)', async () => {
      service.list.mockResolvedValue({ items: [activeDept], total: 1 });

      const req = buildReq({ organizationId: 'org-1', roleName: 'admin_org' });
      await controller.list(
        // Caller tried to scope to org-9 — controller overrides to org-1.
        { organizationId: 'org-9', page: 1, perPage: 50 } as never,
        req,
      );

      expect(service.list).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
      );
    });

    it('master: uses the caller-supplied organizationId when provided', async () => {
      service.list.mockResolvedValue({ items: [], total: 0 });

      await controller.list(
        { organizationId: 'org-7' } as never,
        buildReq({ roleName: 'master', organizationId: null }),
      );

      expect(service.list).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-7' }),
      );
    });

    it('master without query.organizationId: sends empty string (caller opted out of org filter)', async () => {
      service.list.mockResolvedValue({ items: [], total: 0 });

      await controller.list(
        {} as never,
        buildReq({ roleName: 'master', organizationId: null }),
      );

      expect(service.list).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: '' }),
      );
    });

    it('admin_org: forwards search + pagination params', async () => {
      service.list.mockResolvedValue({ items: [], total: 0 });

      await controller.list(
        { page: 2, perPage: 25, search: 'traffic' } as never,
        buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
      );

      expect(service.list).toHaveBeenCalledWith({
        organizationId: 'org-1',
        page: 2,
        perPage: 25,
        search: 'traffic',
      });
    });
  });

  describe('create (POST /)', () => {
    const baseDto = { name: 'Traffic', description: null, organizationId: 'org-1' };

    it('master: creates in any org (DTO.organizationId is honored)', async () => {
      service.create.mockResolvedValue({ ...activeDept, organization_id: 'org-9' });

      const dto = { ...baseDto, organizationId: 'org-9' };
      const result = await controller.create(
        dto as never,
        buildReq({ roleName: 'master', organizationId: null }),
      );

      expect(service.create).toHaveBeenCalledWith({
        name: 'Traffic',
        description: null,
        organizationId: 'org-9',
      });
      expect(result.organization_id).toBe('org-9');
    });

    it('admin_org: creates in own org (DTO.organizationId === user.organizationId)', async () => {
      service.create.mockResolvedValue(activeDept);

      await controller.create(
        baseDto as never,
        buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
      );

      expect(service.create).toHaveBeenCalledWith({
        name: 'Traffic',
        description: null,
        organizationId: 'org-1',
      });
    });

    it('admin_org creating in another org: 403', async () => {
      await expect(
        controller.create(
          { ...baseDto, organizationId: 'org-2' } as never,
          buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('admin_org with no organizationId on caller: 403 (no fallback)', async () => {
      await expect(
        controller.create(
          baseDto as never,
          buildReq({ organizationId: null, roleName: 'admin_org' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('operador_sistema: bypass (treated like master for scope)', async () => {
      service.create.mockResolvedValue({ ...activeDept, organization_id: 'org-9' });

      await controller.create(
        { ...baseDto, organizationId: 'org-9' } as never,
        buildReq({ roleName: 'operador_sistema', organizationId: null }),
      );

      expect(service.create).toHaveBeenCalled();
    });
  });

  describe('findOne (GET /:id)', () => {
    it('admin_org reading own dept: returns the row', async () => {
      service.findById.mockResolvedValue(activeDept);
      const result = await controller.findOne(
        'dept-1',
        buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
      );
      expect(result).toBe(activeDept);
    });

    it('admin_org reading another org: 403', async () => {
      service.findById.mockResolvedValue({ ...activeDept, organization_id: 'org-2' });

      await expect(
        controller.findOne(
          'dept-1',
          buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('master reading any dept: returns the row', async () => {
      service.findById.mockResolvedValue({ ...activeDept, organization_id: 'org-9' });

      const result = await controller.findOne(
        'dept-1',
        buildReq({ roleName: 'master', organizationId: null }),
      );
      expect(result.organization_id).toBe('org-9');
    });
  });

  describe('update (PATCH /:id)', () => {
    it('admin_org updating own dept: delegates to service.update with descriptionProvided flag', async () => {
      service.findById.mockResolvedValue(activeDept);
      service.update.mockResolvedValue({ ...activeDept, name: 'New' });

      await controller.update(
        'dept-1',
        { name: 'New', description: 'updated' } as never,
        buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
      );

      expect(service.update).toHaveBeenCalledWith('dept-1', {
        name: 'New',
        descriptionProvided: true,
        description: 'updated',
      });
    });

    it('admin_org updating another org: 403 (pre-load fires first)', async () => {
      service.findById.mockResolvedValue({ ...activeDept, organization_id: 'org-2' });

      await expect(
        controller.update(
          'dept-1',
          { name: 'X' } as never,
          buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.update).not.toHaveBeenCalled();
    });

    it('description undefined → descriptionProvided: false', async () => {
      service.findById.mockResolvedValue(activeDept);
      service.update.mockResolvedValue(activeDept);

      await controller.update(
        'dept-1',
        { name: 'X' } as never,
        buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
      );

      expect(service.update).toHaveBeenCalledWith('dept-1', {
        name: 'X',
        descriptionProvided: false,
        description: undefined,
      });
    });
  });

  describe('remove (DELETE /:id)', () => {
    it('admin_org deleting own dept: delegates to service.delete', async () => {
      service.findById.mockResolvedValue(activeDept);
      service.delete.mockResolvedValue(undefined);

      await controller.remove(
        'dept-1',
        buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
      );

      expect(service.delete).toHaveBeenCalledWith('dept-1');
    });

    it('admin_org deleting another org: 403', async () => {
      service.findById.mockResolvedValue({ ...activeDept, organization_id: 'org-2' });

      await expect(
        controller.remove(
          'dept-1',
          buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.delete).not.toHaveBeenCalled();
    });
  });
});
