import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { ApiEndpointEntity } from './entities/api-endpoint.entity';
import { MenuOptionEndpointEntity } from './entities/menu-option-endpoint.entity';
import { RoleEntity } from '../../entities/role.entity';
import { MenuOptionsService } from './menu-options.service';
import { MenusService } from './menus.service';

/**
 * F5.5 — MenuOptionsService unit tests (strict TDD).
 *
 * Covers:
 *   F5.5.1: Validation specs (cycle, self-parent, duplicate route, delete-with-children, can_write without can_read)
 *   F5.5.2: CRUD operations (create, update, delete)
 *   F5.5.3: Cycle validation (ancestor chain walk)
 *   F5.5.5: Role matrix grouped by scope
 *   F5.5.6: Endpoint assignment idempotency
 */

// ── Helpers ──────────────────────────────────────────────────────────────

type MockRepo<_T = unknown> = {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
  delete: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
  manager: { transaction: jest.Mock };
};

function makeRepo<T>(): MockRepo<T> {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    remove: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    create: jest.fn().mockImplementation((e) => e),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
      getRawMany: jest.fn().mockResolvedValue([]),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    }),
    manager: { transaction: jest.fn().mockImplementation((cb) => cb({ getRepository: () => makeRepo() })) },
  } as MockRepo<T>;
}

function makeOption(overrides: Partial<MenuOptionEntity> = {}): MenuOptionEntity {
  return Object.assign(new MenuOptionEntity(), {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Option',
    route: '/test',
    icon: null,
    parentId: null,
    displayOrder: 10,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeRole(overrides: Partial<RoleEntity> = {}): RoleEntity {
  return Object.assign(new RoleEntity(), {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'master',
    description: null,
    permissions: [],
    scope: 'platform',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

// ── Test suite ───────────────────────────────────────────────────────────

describe('MenuOptionsService (F5.5, strict TDD)', () => {
  let service: MenuOptionsService;
  let optionRepo: MockRepo<MenuOptionEntity>;
  let roleAccessRepo: MockRepo<MenuOptionRoleEntity>;
  let endpointRepo: MockRepo<ApiEndpointEntity>;
  let optionEndpointRepo: MockRepo<MenuOptionEndpointEntity>;
  let roleRepo: MockRepo<RoleEntity>;
  let menusService: { invalidateCache: jest.Mock };

  const ROLE_MASTER_ID = '11111111-1111-1111-1111-111111111111';
  const ROLE_ORG_ID = '22222222-2222-2222-2222-222222222222';
  const ROLE_REPORTER_ID = '33333333-3333-3333-3333-333333333333';
  const OPT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const OPT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const OPT_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  beforeEach(async () => {
    optionRepo = makeRepo();
    roleAccessRepo = makeRepo();
    endpointRepo = makeRepo();
    optionEndpointRepo = makeRepo();
    roleRepo = makeRepo();
    menusService = { invalidateCache: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuOptionsService,
        { provide: getRepositoryToken(MenuOptionEntity), useValue: optionRepo },
        { provide: getRepositoryToken(MenuOptionRoleEntity), useValue: roleAccessRepo },
        { provide: getRepositoryToken(ApiEndpointEntity), useValue: endpointRepo },
        { provide: getRepositoryToken(MenuOptionEndpointEntity), useValue: optionEndpointRepo },
        { provide: getRepositoryToken(RoleEntity), useValue: roleRepo },
        { provide: MenusService, useValue: menusService },
      ],
    }).compile();

    service = module.get(MenuOptionsService);
  });

  // ══════════════════════════════════════════════════════════════════════
  // F5.5.1 + F5.5.3: Validation specs
  // ══════════════════════════════════════════════════════════════════════

  describe('cycle validation (F5.5.3)', () => {
    it('rejects setting a descendant as parent on update (cycle) with 422', async () => {
      // Hierarchy: A → B → C. Trying to update C's parent to A would create cycle C→A→B→C
      const optA = makeOption({ id: OPT_A, parentId: null });
      const optB = makeOption({ id: OPT_B, parentId: OPT_A });
      const optC = makeOption({ id: OPT_C, parentId: OPT_B });

      optionRepo.findOne
        .mockResolvedValueOnce(optC) // 1st: findOne in update() — get existing option C
        .mockResolvedValueOnce(optC) // 2nd: assertValidParent — start walk from child C
        .mockResolvedValueOnce(optB) // 3rd: walk — C.parentId = B, find B
        .mockResolvedValueOnce(optA); // 4th: walk — B.parentId = A, find A → A === proposed parent ⇒ cycle!

      await expect(
        service.update(OPT_C, { parentId: OPT_A }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects self-parent on update with 422', async () => {
      const opt = makeOption({ id: OPT_A, parentId: null });

      optionRepo.findOne.mockResolvedValueOnce(opt); // findOne: get existing option

      await expect(
        service.update(OPT_A, { parentId: OPT_A }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows setting a valid parent (no cycle)', async () => {
      const root = makeOption({ id: OPT_A, parentId: null });
      const child = makeOption({ id: OPT_B, parentId: null });

      optionRepo.findOne
        .mockResolvedValueOnce(child) // 1st: findOne in update() — get existing option B
        .mockResolvedValueOnce(child) // 2nd: assertValidParent — start walk from child B
        .mockResolvedValueOnce(root); // 3rd: walk — B.parentId = null, but we check B itself first...

      optionRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.update(OPT_B, { parentId: OPT_A });

      expect(result.parentId).toBe(OPT_A);
      expect(menusService.invalidateCache).toHaveBeenCalled();
    });
  });

  describe('duplicate route validation', () => {
    it('rejects duplicate route with 409', async () => {
      const existing = makeOption({ id: OPT_A, route: '/taken' });
      optionRepo.findOne.mockResolvedValueOnce(existing);

      await expect(
        service.create({ name: 'Dup', route: '/taken', displayOrder: 10 }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows same route on update if no other option uses it', async () => {
      const opt = makeOption({ id: OPT_A, route: '/current' });
      optionRepo.findOne
        .mockResolvedValueOnce(opt) // findOne for existing option
        .mockResolvedValueOnce(null); // no other option with this route

      const result = await service.update(OPT_A, { name: 'Updated' });

      expect(result).toBeDefined();
    });

    it('rejects duplicate route on update with 409', async () => {
      const opt = makeOption({ id: OPT_A, route: '/current' });
      const other = makeOption({ id: OPT_B, route: '/taken' });
      optionRepo.findOne
        .mockResolvedValueOnce(opt) // findOne for existing option
        .mockResolvedValueOnce(other); // another option has this route

      await expect(
        service.update(OPT_A, { route: '/taken' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete-with-children validation', () => {
    it('rejects deleting an option that has children with 409', async () => {
      const parent = makeOption({ id: OPT_A });
      const child = makeOption({ id: OPT_B, parentId: OPT_A });

      optionRepo.findOne.mockResolvedValueOnce(parent);
      optionRepo.find.mockResolvedValueOnce([child]);

      await expect(service.delete(OPT_A)).rejects.toThrow(ConflictException);
    });

    it('allows deleting an option with no children', async () => {
      const leaf = makeOption({ id: OPT_A });
      optionRepo.findOne.mockResolvedValueOnce(leaf);
      optionRepo.find.mockResolvedValueOnce([]);

      await expect(service.delete(OPT_A)).resolves.toBeUndefined();
    });
  });

  describe('can_write without can_read validation', () => {
    it('rejects setting canWrite=true with canRead=false (422)', async () => {
      await expect(
        service.setRoleAccess(OPT_A, ROLE_MASTER_ID, { canRead: false, canWrite: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows canRead=true with canWrite=false', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole({ id: ROLE_MASTER_ID }));
      optionRepo.findOne.mockResolvedValue(makeOption({ id: OPT_A }));
      roleAccessRepo.findOne.mockResolvedValue(null);
      roleAccessRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.setRoleAccess(OPT_A, ROLE_MASTER_ID, {
        canRead: true,
        canWrite: false,
      });

      expect(result).toBeDefined();
    });

    it('allows canRead=true with canWrite=true', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole({ id: ROLE_MASTER_ID }));
      optionRepo.findOne.mockResolvedValue(makeOption({ id: OPT_A }));
      roleAccessRepo.findOne.mockResolvedValue(null);
      roleAccessRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.setRoleAccess(OPT_A, ROLE_MASTER_ID, {
        canRead: true,
        canWrite: true,
      });

      expect(result).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // F5.5.2: CRUD operations
  // ══════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('creates a menu option and invalidates cache', async () => {
      optionRepo.findOne.mockResolvedValue(null); // no duplicate route
      optionRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.create({
        name: 'New',
        route: '/new',
        displayOrder: 10,
      });

      expect(result.name).toBe('New');
      expect(result.route).toBe('/new');
      expect(menusService.invalidateCache).toHaveBeenCalled();
    });

    it('sets icon and parentId when provided', async () => {
      const parent = makeOption({ id: OPT_A, parentId: null });
      optionRepo.findOne
        .mockResolvedValueOnce(null) // no duplicate route
        .mockResolvedValueOnce(parent); // parent exists
      optionRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.create({
        name: 'Child',
        route: '/child',
        icon: 'star',
        parentId: OPT_A,
        displayOrder: 20,
      });

      expect(result.icon).toBe('star');
      expect(result.parentId).toBe(OPT_A);
    });
  });

  describe('update', () => {
    it('updates provided fields and invalidates cache', async () => {
      const existing = makeOption({ id: OPT_A, name: 'Old' });
      optionRepo.findOne
        .mockResolvedValueOnce(existing) // findOne for existing
        .mockResolvedValueOnce(null); // no duplicate route
      optionRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.update(OPT_A, { name: 'New' });

      expect(result.name).toBe('New');
      expect(menusService.invalidateCache).toHaveBeenCalled();
    });

    it('throws NotFoundException when option does not exist', async () => {
      optionRepo.findOne.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('soft-deletes and invalidates cache', async () => {
      const leaf = makeOption({ id: OPT_A });
      optionRepo.findOne.mockResolvedValueOnce(leaf);
      optionRepo.find.mockResolvedValueOnce([]);
      optionRepo.save.mockImplementation((e) => Promise.resolve(e));

      await service.delete(OPT_A);

      expect(leaf.deletedAt).toBeInstanceOf(Date);
      expect(menusService.invalidateCache).toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // F5.5.5: Role matrix grouped by scope
  // ══════════════════════════════════════════════════════════════════════

  describe('getRoleMatrix', () => {
    it('groups roles by scope in three blocks', async () => {
      const master = makeRole({ id: ROLE_MASTER_ID, name: 'master' });
      const org = makeRole({ id: ROLE_ORG_ID, name: 'admin_org' });
      const reporter = makeRole({ id: ROLE_REPORTER_ID, name: 'reporter' });

      optionRepo.findOne.mockResolvedValue(makeOption({ id: OPT_A }));
      roleRepo.find.mockResolvedValue([master, org, reporter]);
      roleAccessRepo.find.mockResolvedValue([]);

      const result = await service.getRoleMatrix(OPT_A);

      expect(result).toHaveProperty('platform');
      expect(result).toHaveProperty('organization');
      expect(result).toHaveProperty('public');
    });

    it('includes a new role with no access (can_read=false, can_write=false)', async () => {
      const master = makeRole({ id: ROLE_MASTER_ID, name: 'master' });
      optionRepo.findOne.mockResolvedValue(makeOption({ id: OPT_A }));
      roleRepo.find.mockResolvedValue([master]);
      roleAccessRepo.find.mockResolvedValue([]);

      const result = await service.getRoleMatrix(OPT_A);

      // master has no access row yet → should still appear with defaults
      const platformEntries = result.platform;
      expect(platformEntries).toHaveLength(1);
      expect(platformEntries[0].canRead).toBe(false);
      expect(platformEntries[0].canWrite).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // F5.5.6: Endpoint assignment idempotency + catalog
  // ══════════════════════════════════════════════════════════════════════

  describe('assignEndpoints', () => {
    it('assigns endpoints idempotently (no duplicate rows)', async () => {
      const epId = '44444444-4444-4444-4444-444444444444';
      optionRepo.findOne.mockResolvedValue(makeOption({ id: OPT_A }));
      // Simulate: endpoint already assigned (but we delete all first, then re-add)
      optionEndpointRepo.find.mockResolvedValue([
        { menuOptionId: OPT_A, endpointId: epId },
      ]);
      optionEndpointRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.assignEndpoints(OPT_A, { endpointIds: [epId] });

      expect(result).toHaveLength(1);
    });

    it('assigns new endpoints and removes unlisted ones', async () => {
      const epId1 = '44444444-4444-4444-4444-444444444444';
      const epId2 = '55555555-5555-5555-5555-555555555555';

      optionRepo.findOne.mockResolvedValue(makeOption({ id: OPT_A }));
      // Currently assigned: none
      optionEndpointRepo.find.mockResolvedValue([]);
      optionEndpointRepo.save.mockImplementation((e) => Promise.resolve(e));
      optionEndpointRepo.delete.mockResolvedValue({ affected: 0 });

      const result = await service.assignEndpoints(OPT_A, { endpointIds: [epId1, epId2] });

      expect(result).toHaveLength(2);
    });
  });

  describe('getEndpointCatalog', () => {
    it('returns paginated results', async () => {
      const ep = Object.assign(new ApiEndpointEntity(), {
        id: 'ep-1',
        method: 'GET',
        path: '/api/test',
        description: 'Test endpoint',
        createdAt: new Date(),
      });
      const qb = endpointRepo.createQueryBuilder();
      qb.addOrderBy = jest.fn().mockReturnThis();
      qb.getManyAndCount.mockResolvedValue([[ep], 1]);

      const result = await service.getEndpointCatalog({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    // sc-334 admin-controles-enhancements Phase 1 (1.5/1.6) — module filter
    it('filters by module (case-insensitive substring on path)', async () => {
      const qb = endpointRepo.createQueryBuilder();
      qb.addOrderBy = jest.fn().mockReturnThis();
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getEndpointCatalog({ module: 'incidents' });

      // Build a regex of expected ILIKE arguments — we just verify the
      // module substring made it into a query builder call.
      const andWhereCalls = qb.andWhere.mock.calls.map((c: unknown[]) => c[0]);
      const moduleUsed = andWhereCalls.some(
        (sql: unknown) => typeof sql === 'string' && sql.includes('ILIKE') && sql.includes(':module'),
      );
      expect(moduleUsed).toBe(true);
    });

    it('omits module filter when module is empty/undefined', async () => {
      const qb = endpointRepo.createQueryBuilder();
      qb.addOrderBy = jest.fn().mockReturnThis();
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getEndpointCatalog({ module: '' });

      const andWhereCalls = qb.andWhere.mock.calls.map((c: unknown[]) => c[0]);
      const moduleUsed = andWhereCalls.some(
        (sql: unknown) => typeof sql === 'string' && sql.includes(':module'),
      );
      expect(moduleUsed).toBe(false);
    });
  });

  // sc-334 admin-controles-enhancements Phase 1 (1.1/1.2) — getAssignedEndpoints
  describe('getAssignedEndpoints', () => {
    it('returns endpoints assigned to the menu (via menu_option_endpoints join)', async () => {
      const ep1 = Object.assign(new ApiEndpointEntity(), {
        id: 'ep-1',
        method: 'GET',
        path: '/api/incidents',
        description: 'List incidents',
        createdAt: new Date(),
      });
      const ep2 = Object.assign(new ApiEndpointEntity(), {
        id: 'ep-2',
        method: 'POST',
        path: '/api/incidents',
        description: 'Create incident',
        createdAt: new Date(),
      });
      // The repo must support a query builder with .innerJoin + .getMany().
      const joinQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([ep1, ep2]),
      };
      endpointRepo.createQueryBuilder.mockReturnValue(joinQb);
      optionRepo.findOne.mockResolvedValue(
        Object.assign(new MenuOptionEntity(), { id: 'opt-1', name: 'Test' }),
      );

      const result = await service.getAssignedEndpoints('opt-1');

      expect(result).toHaveLength(2);
      expect(result.map((e: ApiEndpointEntity) => e.id)).toEqual(['ep-1', 'ep-2']);
    });

    it('returns empty array when the menu has no assigned endpoints', async () => {
      const joinQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      endpointRepo.createQueryBuilder.mockReturnValue(joinQb);
      optionRepo.findOne.mockResolvedValue(
        Object.assign(new MenuOptionEntity(), { id: 'opt-2', name: 'Empty' }),
      );

      const result = await service.getAssignedEndpoints('opt-2');

      expect(result).toEqual([]);
    });

    it('throws NotFoundException when the menu does not exist', async () => {
      optionRepo.findOne.mockResolvedValue(null);

      await expect(service.getAssignedEndpoints('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    // sc-334 admin-controles-enhancements Phase 10 — auto-association
    // fallback. When the menu_option_endpoints junction has no rows for
    // the selected option, getAssignedEndpoints must infer endpoints
    // from the option's name (or its parent's name) and the api_endpoints
    // catalog, so the admin UI shows endpoints out-of-the-box without
    // requiring manual assignment.

    it('auto-associates sub-menu "Usuarios" with all endpoints under /api/users', async () => {
      // Hierarchy: GESTIÓN → Usuarios. Usuarios is level-2 (has
      // parentId set to the GESTIÓN section header).
      optionRepo.findOne
        // 1st call: findOne(optionId) → Usuarios itself
        .mockResolvedValueOnce(
          makeOption({
            id: 'opt-users',
            name: 'Usuarios',
            parentId: 'opt-gestion',
          }),
        )
        // 2nd call: inferApiModule loads parent → GESTIÓN (level-1, no
        // parent). The parent.parentId check sees null and routes us
        // through the level-2 branch (uses option.name).
        .mockResolvedValueOnce(
          makeOption({
            id: 'opt-gestion',
            name: 'GESTIÓN',
            parentId: null,
          }),
        );

      // 1st createQueryBuilder call (junction query) returns []. 2nd
      // call (inference query) returns the 3 /api/users endpoints.
      const inferenceResult = [
        Object.assign(new ApiEndpointEntity(), { id: 'ep-get', method: 'GET', path: '/api/users' }),
        Object.assign(new ApiEndpointEntity(), { id: 'ep-post', method: 'POST', path: '/api/users' }),
        Object.assign(new ApiEndpointEntity(), { id: 'ep-patch', path: '/api/users/:id', method: 'PATCH' }),
      ];
      const inferenceQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(inferenceResult),
      };
      endpointRepo.createQueryBuilder
        .mockReturnValueOnce({
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        })
        .mockReturnValueOnce(inferenceQb);

      const result = await service.getAssignedEndpoints('opt-users');

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.path).sort()).toEqual([
        '/api/users',
        '/api/users',
        '/api/users/:id',
      ]);
    });

    it('auto-associates sub-sub-menu "Crear usuario" with POST /api/users (inherits module from parent)', async () => {
      // Hierarchy: GESTIÓN → Usuarios → Crear usuario.
      // Roles has parentId set (to GESTIÓN) so it counts as level-2.
      optionRepo.findOne
        // 1st call: findOne(optionId) → the sub-sub-menu option
        .mockResolvedValueOnce(
          makeOption({
            id: 'opt-crear-usuario',
            name: 'Crear usuario',
            parentId: 'opt-users',
          }),
        )
        // 2nd call: inferApiModule loads parent → "Usuarios" (level-2)
        .mockResolvedValueOnce(
          makeOption({
            id: 'opt-users',
            name: 'Usuarios',
            parentId: 'opt-gestion',
          }),
        );

      const inferenceResult = [
        Object.assign(new ApiEndpointEntity(), {
          id: 'ep-post-users',
          method: 'POST',
          path: '/api/users',
        }),
      ];
      const inferenceQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(inferenceResult),
      };
      endpointRepo.createQueryBuilder
        .mockReturnValueOnce({
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        })
        .mockReturnValueOnce(inferenceQb);

      const result = await service.getAssignedEndpoints('opt-crear-usuario');

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/api/users');
      expect(result[0].method).toBe('POST');
    });

    it('auto-associates sub-sub-menu "Editar rol" with PATCH /api/roles/:id (inherits module from parent "Roles")', async () => {
      // Hierarchy: GESTIÓN → Roles → Editar rol. Roles is level-2 (has
      // parentId set to GESTIÓN).
      optionRepo.findOne
        .mockResolvedValueOnce(
          makeOption({
            id: 'opt-editar-rol',
            name: 'Editar rol',
            parentId: 'opt-roles',
          }),
        )
        .mockResolvedValueOnce(
          makeOption({
            id: 'opt-roles',
            name: 'Roles',
            parentId: 'opt-gestion',
          }),
        );

      const inferenceResult = [
        Object.assign(new ApiEndpointEntity(), {
          id: 'ep-patch-roles',
          method: 'PATCH',
          path: '/api/roles/:id',
        }),
      ];
      const inferenceQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(inferenceResult),
      };
      endpointRepo.createQueryBuilder
        .mockReturnValueOnce({
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        })
        .mockReturnValueOnce(inferenceQb);

      const result = await service.getAssignedEndpoints('opt-editar-rol');

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/api/roles/:id');
      expect(result[0].method).toBe('PATCH');
    });

    it('manual junction assignment wins over auto-association when present', async () => {
      // Both the selected option and its parent exist; manual assignment
      // has 1 endpoint in the junction. The inference path must NOT be
      // taken — the manual assignment is the source of truth.
      optionRepo.findOne.mockResolvedValue(
        makeOption({ id: 'opt-custom', name: 'Usuarios', parentId: null }),
      );

      const manualResult = [
        Object.assign(new ApiEndpointEntity(), {
          id: 'ep-manual',
          method: 'GET',
          path: '/api/some/other/path',
        }),
      ];
      endpointRepo.createQueryBuilder.mockReturnValueOnce({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(manualResult),
      });

      const result = await service.getAssignedEndpoints('opt-custom');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ep-manual');
      expect(endpointRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when name has no API module mapping (e.g., "Controles" with custom path)', async () => {
      optionRepo.findOne.mockResolvedValue(
        makeOption({ id: 'opt-orphan', name: 'No mapping for this name', parentId: null }),
      );

      endpointRepo.createQueryBuilder.mockReturnValueOnce({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getAssignedEndpoints('opt-orphan');

      expect(result).toEqual([]);
      // Only the junction query was issued — no inference query.
      expect(endpointRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });
  });
});
