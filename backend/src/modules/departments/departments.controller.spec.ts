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
    createWithCategories: jest.Mock;
    findById: jest.Mock;
    findByIdWithCategories: jest.Mock;
    update: jest.Mock;
    updateWithCategories: jest.Mock;
    delete: jest.Mock;
  };
  let controller: DepartmentsController;
  let reflector: Reflector;

  beforeEach(() => {
    service = {
      list: jest.fn(),
      create: jest.fn(),
      createWithCategories: jest.fn(),
      findById: jest.fn(),
      findByIdWithCategories: jest.fn(),
      update: jest.fn(),
      updateWithCategories: jest.fn(),
      delete: jest.fn(),
    };
    controller = new DepartmentsController(service as unknown as DepartmentsService);
    reflector = new Reflector();
  });

  // sc-323 sibling / 2026-09-15-departments-module verify-report W3:
  // guard behavior is exercised in `permission.guard.spec.ts` and
  // `jwt-auth.guard.spec.ts`. Here we only assert the controller's
  // wiring (it lists the guards in its `@UseGuards` metadata) so a
  // future refactor that drops either guard trips a unit-level red.
  it('is wired with JwtAuthGuard + PermissionGuard at the class level', () => {
    const guards: unknown[] =
      Reflect.getMetadata('__guards__', DepartmentsController) ?? [];
    const guardNames = guards.map((g) => (g as { name: string }).name);
    expect(guardNames).toEqual(expect.arrayContaining(['JwtAuthGuard', 'PermissionGuard']));
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
    // front/2026-09-15-departments-menu 6.1: the response items carry
    // organization_name + user_count from the LEFT JOIN (design D2).
    it('returns the enriched shape from the service (organization_name + user_count preserved through the controller)', async () => {
      const enriched = [
        {
          ...activeDept,
          organization_id: 'org-1',
          organization_name: 'GAD Quito',
          user_count: 7,
        },
      ];
      service.list.mockResolvedValue({ items: enriched, total: 1 });

      const result = await controller.list(
        {} as never,
        buildReq({ roleName: 'master', organizationId: null }),
      );

      expect(result.items[0]).toMatchObject({
        organization_name: 'GAD Quito',
        user_count: 7,
      });
    });

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

    it('master: uses the caller-supplied organization_id when provided', async () => {
      service.list.mockResolvedValue({ items: [], total: 0 });

      await controller.list(
        { organization_id: 'org-7' } as never,
        buildReq({ roleName: 'master', organizationId: null }),
      );

      expect(service.list).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-7' }),
      );
    });

    it('master without query.organization_id: opts out of the org filter (empty string passed to repo, which interprets as no-filter)', async () => {
      // Spec S2.2: master sees ALL non-deleted depts from all orgs when no
      // filter is provided. The controller signals "no filter" by passing
      // an empty string to the repo; the repo interprets empty/nullish
      // organizationId as "do not constrain by org".
      service.list.mockResolvedValue({
        items: [
          { ...activeDept, id: 'dept-a', organization_id: 'org-1' },
          { ...activeDept, id: 'dept-b', organization_id: 'org-2' },
        ],
        total: 2,
      });

      const result = await controller.list(
        {} as never,
        buildReq({ roleName: 'master', organizationId: null }),
      );

      expect(service.list).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: '' }),
      );
      // Result reflects what the repo returns under no-filter — both
      // orgs visible. This is what spec S2.2 promises.
      expect(result.items.map((i) => i.organization_id).sort()).toEqual(['org-1', 'org-2']);
    });

    it('admin_org: forwards search + pagination params (snake_case wire)', async () => {
      service.list.mockResolvedValue({ items: [], total: 0 });

      // Wire is snake_case per the project convention
      // (incident-categories uses @Query('per_page') perPage?: string,
      // forbidNonWhitelisted: true in main.ts).
      await controller.list(
        { page: '2', per_page: '25', search: 'traffic' } as never,
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
    const baseDto = { name: 'Traffic', description: null, organization_id: 'org-1' };

    it('master: creates in any org (DTO.organization_id is honored)', async () => {
      service.createWithCategories.mockResolvedValue({ ...activeDept, organization_id: 'org-9' });

      const dto = { ...baseDto, organization_id: 'org-9' };
      const result = await controller.create(
        dto as never,
        buildReq({ roleName: 'master', organizationId: null }),
      );

      expect(service.createWithCategories).toHaveBeenCalledWith({
        name: 'Traffic',
        description: null,
        organizationId: 'org-9',
      }, []);
      expect(result.organization_id).toBe('org-9');
    });

    it('admin_org: creates in own org (DTO.organization_id === user.organizationId)', async () => {
      service.createWithCategories.mockResolvedValue(activeDept);

      await controller.create(
        baseDto as never,
        buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
      );

      expect(service.createWithCategories).toHaveBeenCalledWith({
        name: 'Traffic',
        description: null,
        organizationId: 'org-1',
      }, []);
    });

    it('admin_org creating in another org: 403', async () => {
      await expect(
        controller.create(
          { ...baseDto, organization_id: 'org-2' } as never,
          buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.createWithCategories).not.toHaveBeenCalled();
    });

    it('admin_org with no organizationId on caller: 403 (no fallback)', async () => {
      await expect(
        controller.create(
          baseDto as never,
          buildReq({ organizationId: null, roleName: 'admin_org' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.createWithCategories).not.toHaveBeenCalled();
    });

    it('operador_sistema: bypass (treated like master for scope)', async () => {
      service.createWithCategories.mockResolvedValue({ ...activeDept, organization_id: 'org-9' });

      await controller.create(
        { ...baseDto, organization_id: 'org-9' } as never,
        buildReq({ roleName: 'operador_sistema', organizationId: null }),
      );

      expect(service.createWithCategories).toHaveBeenCalled();
    });
  });

  describe('findOne (GET /:id)', () => {
    it('admin_org reading own dept: returns the row', async () => {
      service.findById.mockResolvedValue(activeDept);
      service.findByIdWithCategories.mockResolvedValue({ department: activeDept, category_ids: [] });
      const result = await controller.findOne(
        'dept-1',
        buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
      );
      expect(result).toEqual({ department: activeDept, category_ids: [] });
    });

    it('admin_org reading another org: 403', async () => {
      service.findById.mockResolvedValue({ ...activeDept, organization_id: 'org-2' });
      service.findByIdWithCategories.mockResolvedValue({ department: { ...activeDept, organization_id: 'org-2' }, category_ids: [] });
      await expect(
        controller.findOne(
          'dept-1',
          buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('master reading any dept: returns the row', async () => {
      service.findById.mockResolvedValue({ ...activeDept, organization_id: 'org-9' });
      service.findByIdWithCategories.mockResolvedValue({ department: { ...activeDept, organization_id: 'org-9' }, category_ids: [] });
      const result = await controller.findOne(
        'dept-1',
        buildReq({ roleName: 'master', organizationId: null }),
      );
      expect(result.department.organization_id).toBe('org-9');
    });
  });

  describe('update (PATCH /:id)', () => {
    it('admin_org updating own dept: delegates to service.update with descriptionProvided flag', async () => {
      service.findById.mockResolvedValue(activeDept);
      service.findByIdWithCategories.mockResolvedValue({ department: activeDept, category_ids: [] });
      service.updateWithCategories.mockResolvedValue({ ...activeDept, name: 'New' });

      await controller.update(
        'dept-1',
        { name: 'New', description: 'updated' } as never,
        buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
      );

      expect(service.updateWithCategories).toHaveBeenCalledWith('dept-1', {
        name: 'New',
        descriptionProvided: true,
        description: 'updated',
      }, null);
    });

    it('admin_org updating another org: 403 (pre-load fires first)', async () => {
      service.findById.mockResolvedValue({ ...activeDept, organization_id: 'org-2' });
      service.findByIdWithCategories.mockResolvedValue({ department: { ...activeDept, organization_id: 'org-2' }, category_ids: [] });
      await expect(
        controller.update(
          'dept-1',
          { name: 'X' } as never,
          buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.updateWithCategories).not.toHaveBeenCalled();
    });

    it('description undefined → descriptionProvided: false', async () => {
      service.findById.mockResolvedValue(activeDept);
      service.findByIdWithCategories.mockResolvedValue({ department: activeDept, category_ids: [] });
      service.updateWithCategories.mockResolvedValue(activeDept);

      await controller.update(
        'dept-1',
        { name: 'X' } as never,
        buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
      );

      expect(service.updateWithCategories).toHaveBeenCalledWith('dept-1', {
        name: 'X',
        descriptionProvided: false,
        description: undefined,
      }, null);
    });
  });

  describe('remove (DELETE /:id)', () => {
    it('admin_org deleting own dept: returns the deleted row shape (id, deleted_at)', async () => {
      // front/2026-09-15-departments-menu D8: DELETE returns 200 with
      // { id, deleted_at }, not 204. The controller's HTTP code is now
      // the default (200), and the response body carries the soft-deleted
      // row so the frontend can show "deleted at" in the toast.
      const deletedAt = new Date('2026-09-15T20:00:00Z');
      service.findById.mockResolvedValue(activeDept);
      service.findByIdWithCategories.mockResolvedValue({ department: activeDept, category_ids: [] });
      service.delete.mockResolvedValue({ id: 'dept-1', deleted_at: deletedAt });

      const result = await controller.remove(
        'dept-1',
        buildReq({ organizationId: 'org-1', roleName: 'admin_org' }),
      );

      expect(service.delete).toHaveBeenCalledWith('dept-1');
      expect(result).toEqual({ id: 'dept-1', deleted_at: deletedAt });
    });

    it('admin_org deleting another org: 403 (pre-load fires first)', async () => {
      service.findById.mockResolvedValue({ ...activeDept, organization_id: 'org-2' });
      service.findByIdWithCategories.mockResolvedValue({ department: { ...activeDept, organization_id: 'org-2' }, category_ids: [] });
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
