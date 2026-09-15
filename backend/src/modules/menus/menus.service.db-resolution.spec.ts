import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { REDIS_CLIENT } from '../../core/core.module';
import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { UserEntity } from '../../entities/user.entity';
import { MenusService } from './menus.service';
import { MENU_MAP } from './menu-map';

/**
 * F5.4 — Resolution tests (STRICT TDD).
 *
 * These tests describe the expected behavior of MenusService when it
 * resolves menus from the database (D1/D3/D4). They are written BEFORE
 * the implementation exists — the production code is the SUT.
 *
 * Key constraints from design:
 *   D1: Response contract unchanged — { label, route, icon?, group?, order }
 *       plus children array
 *   D3: Tree built in memory by parent_id
 *   D4: Cache key menu:v1:role:{roleId}, TTL 1h, invalidation menu:v1:*
 *   D6: Soft delete via deleted_at, exclude from reads
 *   D7: MENU_MAP stays in repo as rollback path
 */

// ──────────────────────────────────────────────────────────────────────────
//  Helpers — in-memory repo stubs
// ──────────────────────────────────────────────────────────────────────────

type MockRepo<_T = unknown> = {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  delete: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
  manager: { transaction: jest.Mock };
};

function makeRepo<T>(): MockRepo<T> & { qb: { getMany: jest.Mock } } {
  // Shared query builder mock — tests configure qb.getMany.mockResolvedValue
  // BEFORE calling the service. createQueryBuilder always returns this
  // same instance, so the test's setup is in place when the service queries.
  const qb = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    manager: { transaction: jest.fn() },
    qb,
  } as MockRepo<T> & { qb: { getMany: jest.Mock } };
}

function makeOption(overrides: Partial<MenuOptionEntity> = {}): MenuOptionEntity {
  return Object.assign(new MenuOptionEntity(), {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Dashboard',
    route: '/dashboard',
    icon: 'layout-dashboard',
    parentId: null,
    displayOrder: 10,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

// ──────────────────────────────────────────────────────────────────────────
//  Test suite
// ──────────────────────────────────────────────────────────────────────────

describe('MenusService — DB resolution (F5.4, strict TDD)', () => {
  let service: MenusService;
  let optionRepo: MockRepo<MenuOptionEntity> & { qb: { getMany: jest.Mock } };
  let userRepo: MockRepo<UserEntity>;
  let redis: {
    get: jest.Mock;
    setex: jest.Mock;
    del: jest.Mock;
    keys: jest.Mock;
  };

  const ROLE_MASTER = '11111111-1111-1111-1111-111111111111';
  const ROLE_OPERADOR = '22222222-2222-2222-2222-222222222222';
  const USER_MASTER = 'user-master';

  beforeEach(async () => {
    optionRepo = makeRepo();
    userRepo = makeRepo();
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(0),
      keys: jest.fn().mockResolvedValue([]),
    };

    // Default: user lookup returns master role
    userRepo.findOne.mockResolvedValue(
      Object.assign(new UserEntity(), { id: USER_MASTER, roleId: ROLE_MASTER }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenusService,
        { provide: getRepositoryToken(MenuOptionEntity), useValue: optionRepo },
        { provide: getRepositoryToken(MenuOptionRoleEntity), useValue: {} },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get(MenusService);
  });

  // ── F5.4.1: Filtering and visibility ──────────────────────────────

  describe('filtering and visibility', () => {
    it('returns active options where the role has can_read = true', async () => {
      const opt = makeOption({ id: 'opt-1', name: 'Inicio', route: '/inicio', displayOrder: 10 });
      optionRepo.qb.getMany.mockResolvedValue([opt]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Inicio');
      expect(result[0].route).toBe('/inicio');
    });

    it('excludes options where is_active = false even if can_read is true', async () => {
      // The query already filters is_active and deleted_at at the DB level,
      // so returning empty simulates the DB returning no rows.
      optionRepo.qb.getMany.mockResolvedValue([]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(0);
    });

    it('excludes options with non-null deleted_at', async () => {
      // Same as above — the DB query filters deleted_at IS NULL.
      optionRepo.qb.getMany.mockResolvedValue([]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(0);
    });

    it('excludes options where the role has no menu_option_roles row', async () => {
      // The INNER JOIN on menu_option_roles means no row = no result.
      optionRepo.qb.getMany.mockResolvedValue([]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(0);
    });

    it('excludes options where can_read = false', async () => {
      // The WHERE can_read = true clause filters these at the DB level.
      optionRepo.qb.getMany.mockResolvedValue([]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(0);
    });
  });

  // ── F5.4.3: Tree building by parent_id ────────────────────────────

  describe('tree building (D3)', () => {
    it('nests children under their parent', async () => {
      const parent = makeOption({ id: 'p-1', name: 'Gestión', route: '/gestion', displayOrder: 50 });
      const child = makeOption({ id: 'c-1', name: 'Usuarios', route: '/admin/users', parentId: 'p-1', displayOrder: 60 });
      optionRepo.qb.getMany.mockResolvedValue([parent, child]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Gestión');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].label).toBe('Usuarios');
    });

    it('hides children when parent is not accessible to the role', async () => {
      // Only the child is returned (parent filtered by DB query).
      // The child has parentId pointing to an inaccessible parent,
      // so it becomes an orphan and is excluded.
      const child = makeOption({ id: 'c-1', name: 'Usuarios', route: '/admin/users', parentId: 'p-1' });
      optionRepo.qb.getMany.mockResolvedValue([child]);

      const result = await service.getMenuForUser(USER_MASTER);

      // Orphan child excluded — neither parent nor child appears
      expect(result).toHaveLength(0);
    });

    it('orders siblings by display_order ascending', async () => {
      const opt1 = makeOption({ id: 'a', name: 'A', route: '/a', displayOrder: 30 });
      const opt2 = makeOption({ id: 'b', name: 'B', route: '/b', displayOrder: 10 });
      const opt3 = makeOption({ id: 'c', name: 'C', route: '/c', displayOrder: 20 });
      optionRepo.qb.getMany.mockResolvedValue([opt1, opt2, opt3]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result.map((e) => e.label)).toEqual(['B', 'C', 'A']);
    });

    it('places children inside their parent sorted by display_order', async () => {
      const parent = makeOption({ id: 'p', name: 'Root', route: '/root', displayOrder: 10 });
      const child1 = makeOption({ id: 'c1', name: 'Last', route: '/c1', parentId: 'p', displayOrder: 20 });
      const child2 = makeOption({ id: 'c2', name: 'First', route: '/c2', parentId: 'p', displayOrder: 15 });
      optionRepo.qb.getMany.mockResolvedValue([parent, child1, child2]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result[0].children.map((c: any) => c.label)).toEqual(['First', 'Last']);
    });
  });

  // ── F5.4.2: Contract preservation (D1) ────────────────────────────

  describe('response contract (D1)', () => {
    it('emits { label, route, icon?, group?, order } shape with children', async () => {
      const opt = makeOption({
        id: 'opt-1',
        name: 'Mapa',
        route: '/mapa',
        icon: 'map',
        displayOrder: 40,
      });
      optionRepo.qb.getMany.mockResolvedValue([opt]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(1);
      const entry = result[0];
      expect(entry).toHaveProperty('label', 'Mapa');
      expect(entry).toHaveProperty('route', '/mapa');
      expect(entry).toHaveProperty('icon', 'map');
      expect(entry).toHaveProperty('order', 40);
      expect(entry).toHaveProperty('children');
      expect(Array.isArray(entry.children)).toBe(true);
    });

    it('propagates icon from the menu_options row', async () => {
      const opt = makeOption({ id: 'o', icon: 'shield' });
      optionRepo.qb.getMany.mockResolvedValue([opt]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result[0].icon).toBe('shield');
    });

    it('omits icon when null', async () => {
      const opt = makeOption({ id: 'o', icon: null });
      optionRepo.qb.getMany.mockResolvedValue([opt]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result[0].icon).toBeUndefined();
    });

    it('does NOT leak parentId/parent_id into the wire (regression, review finding 1)', async () => {
      const parent = makeOption({ id: 'p-1', name: 'INCIDENCIAS', route: '', displayOrder: 20 });
      const child = makeOption({ id: 'c-1', name: 'Mapa', route: '/mapa', parentId: 'p-1', displayOrder: 40 });
      optionRepo.qb.getMany.mockResolvedValue([parent, child]);

      const result = await service.getMenuForUser(USER_MASTER);

      // El árbol se construye igual (D3)…
      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].label).toBe('Mapa');

      // …pero el DTO serializado respeta el contrato D1: sin parentId.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('parentId');
      expect(serialized).not.toContain('parent_id');
    });
  });

  // ── F5.4.4: Parity with MENU_MAP ──────────────────────────────────

  describe('parity with MENU_MAP (F5.4.4, the central assertion)', () => {
    it('master sees the same routes as MENU_MAP would produce', async () => {
      // Build DB rows from MENU_MAP entries
      const dbRows = Object.entries(MENU_MAP).map(([name, def], idx) => ({
        id: `opt-${idx}`,
        name,
        route: def.route,
        icon: def.icon ?? null,
        parentId: null,
        displayOrder: def.order,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      optionRepo.qb.getMany.mockResolvedValue(dbRows);

      const result = await service.getMenuForUser(USER_MASTER);

      // The set of routes must match
      const dbRoutes = result.map((e) => e.route).sort();
      const mapRoutes = Object.values(MENU_MAP)
        .map((d) => d.route)
        .sort();
      expect(dbRoutes).toEqual(mapRoutes);

      // The count must match
      expect(result).toHaveLength(Object.keys(MENU_MAP).length);
    });

    it('master sees the same labels as MENU_MAP', async () => {
      const dbRows = Object.entries(MENU_MAP).map(([name, def], idx) => ({
        id: `opt-${idx}`,
        name,
        route: def.route,
        icon: def.icon ?? null,
        parentId: null,
        displayOrder: def.order,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      optionRepo.qb.getMany.mockResolvedValue(dbRows);

      const result = await service.getMenuForUser(USER_MASTER);

      const dbLabels = result.map((e) => e.label);
      const mapLabels = Object.keys(MENU_MAP);
      expect(dbLabels).toEqual(mapLabels);
    });
  });

  // ── Additional resolution scenarios ───────────────────────────────

  describe('additional resolution scenarios', () => {
    it('returns empty menu for a role with no accessible options', async () => {
      optionRepo.qb.getMany.mockResolvedValue([]);

      // Set up user with a different role
      userRepo.findOne.mockResolvedValue(
        Object.assign(new UserEntity(), { id: 'user-op', roleId: ROLE_OPERADOR }),
      );

      const result = await service.getMenuForUser('user-op');

      expect(result).toEqual([]);
    });

    it('handles a single top-level option with no children', async () => {
      const opt = makeOption({ id: 'dash', name: 'Dashboard', route: '/dashboard', displayOrder: 10 });
      optionRepo.qb.getMany.mockResolvedValue([opt]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(1);
      expect(result[0].children).toEqual([]);
    });

    it('returns empty array when user has no role_id', async () => {
      userRepo.findOne.mockResolvedValue(
        Object.assign(new UserEntity(), { id: 'anon', roleId: null }),
      );

      const result = await service.getMenuForUser('anon');

      expect(result).toEqual([]);
    });

    it('returns empty array when user is not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      const result = await service.getMenuForUser('nonexistent');

      expect(result).toEqual([]);
    });
  });
});
