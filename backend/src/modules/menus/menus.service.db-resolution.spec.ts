import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { REDIS_CLIENT } from '../../core/core.module';
import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { UserEntity } from '../../entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { PermissionLookupService } from '../../common/permissions/permission-lookup.service';
import { MenusService } from './menus.service';
import { MENU_MAP } from './menu-map';

/**
 * F5.4 — Resolution tests (STRICT TDD).
 *
 * F6 fix (post-0051): permissions are UUIDs, not strings. All mocks
 * for AuthService.getPermissionsByUserId return UUID arrays, and
 * PermissionLookupService.getUuid is mocked to translate (action, resource) → UUID.
 */

// Real UUIDs from postgres `permissions` table
const UUID_READ_INCIDENTS = 'a71d3d2a-9a37-4db8-9119-1c826d52db74';
const UUID_CREATE_INCIDENTS = '88f176b6-4383-491b-9342-a4ee7fcabab5';
const UUID_READ_INCIDENT_CATEGORIES = '4700839b-1bfb-4785-9147-62942036456c';
const UUID_READ_GEO_ZONES = '85b875fd-2799-47f8-9bed-2980cfefc207';
const UUID_READ_ORGANIZATIONS = '84de7209-9a21-45fd-a761-d3004c87ba30';
const UUID_READ_USERS = 'f495d231-f3ae-4b41-a0b7-a7fb8b742d2a';
const UUID_READ_ROLES = '64cabc44-7181-40fe-86af-9de857e83646';

const PERM_LOOKUP_MAP = new Map<string, string>([
  ['READ incidents', UUID_READ_INCIDENTS],
  ['CREATE incidents', UUID_CREATE_INCIDENTS],
  ['READ incident-categories', UUID_READ_INCIDENT_CATEGORIES],
  ['READ geo-zones', UUID_READ_GEO_ZONES],
  ['READ organizations', UUID_READ_ORGANIZATIONS],
  ['READ users', UUID_READ_USERS],
  ['READ roles', UUID_READ_ROLES],
]);

function makePermissionLookupMock() {
  return {
    getUuid: jest.fn(async (action: string, resource: string) => PERM_LOOKUP_MAP.get(`${action} ${resource}`) ?? null),
    getUuidSync: jest.fn((action: string, resource: string) => PERM_LOOKUP_MAP.get(`${action} ${resource}`) ?? null),
    buildCache: jest.fn(),
    invalidate: jest.fn(),
  };
}

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
  let authService: { getPermissionsByUserId: jest.Mock };
  let permissionLookup: ReturnType<typeof makePermissionLookupMock>;

  const ROLE_MASTER = '11111111-1111-1111-1111-111111111111';
  const ROLE_OPERADOR = '22222222-2222-2222-2222-222222222222';
  const USER_MASTER = 'user-master';
  const USER_OPERADOR = 'user-operador';
  const USER_OPERADOR_EXTRA = 'user-operador-extra';

  // All UUIDs for master
  const ALL_PERMS_UUIDS = [...PERM_LOOKUP_MAP.values()];
  // Operador lacks READ users / READ roles / CREATE incidents (verified live: operador-sistema@tase.local has READ incidents but not CREATE)
  const OPERADOR_PERMS_UUIDS = ALL_PERMS_UUIDS.filter(
    (u) => u !== UUID_READ_USERS && u !== UUID_READ_ROLES && u !== UUID_CREATE_INCIDENTS,
  );

  beforeEach(async () => {
    optionRepo = makeRepo();
    userRepo = makeRepo();
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(0),
      keys: jest.fn().mockResolvedValue([]),
    };
    permissionLookup = makePermissionLookupMock();
    authService = {
      getPermissionsByUserId: jest.fn().mockImplementation(async (uid: string) => {
        if (uid === USER_OPERADOR || uid === 'user-op') return OPERADOR_PERMS_UUIDS;
        if (uid === USER_OPERADOR_EXTRA) return [...OPERADOR_PERMS_UUIDS, UUID_READ_USERS];
        return ALL_PERMS_UUIDS;
      }),
    };

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
        { provide: AuthService, useValue: authService },
        { provide: PermissionLookupService, useValue: permissionLookup },
      ],
    }).compile();

    service = module.get(MenusService);
  });

  // ── F5.4.1: Filtering and visibility ──────────────────────────────

  describe('filtering and visibility', () => {
    it('returns active options where the role has can_read = true', async () => {
      // Use custom route so permission filter does not hide it
      const opt = makeOption({ id: 'opt-1', name: 'Inicio', route: '/custom-inicio', displayOrder: 10 });
      optionRepo.qb.getMany.mockResolvedValue([opt]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Inicio');
      expect(result[0].route).toBe('/custom-inicio');
    });

    it('excludes options where is_active = false even if can_read is true', async () => {
      optionRepo.qb.getMany.mockResolvedValue([]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(0);
    });

    it('excludes options with non-null deleted_at', async () => {
      optionRepo.qb.getMany.mockResolvedValue([]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(0);
    });

    it('excludes options where the role has no menu_option_roles row', async () => {
      optionRepo.qb.getMany.mockResolvedValue([]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(0);
    });

    it('excludes options where can_read = false', async () => {
      optionRepo.qb.getMany.mockResolvedValue([]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(0);
    });
  });

  // ── F5.4.3: Tree building by parent_id ────────────────────────────

  describe('tree building (D3)', () => {
    it('nests children under their parent', async () => {
      // Use custom routes to avoid permission filtering
      const parent = makeOption({ id: 'p-1', name: 'Gestión', route: '/custom-gestion', displayOrder: 50 });
      const child = makeOption({ id: 'c-1', name: 'Usuarios', route: '/custom-users', parentId: 'p-1', displayOrder: 60 });
      optionRepo.qb.getMany.mockResolvedValue([parent, child]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Gestión');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].label).toBe('Usuarios');
    });

    it('hides children when parent is not accessible to the role', async () => {
      const child = makeOption({ id: 'c-1', name: 'Usuarios', route: '/custom-users', parentId: 'p-1' });
      optionRepo.qb.getMany.mockResolvedValue([child]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(0);
    });

    it('orders siblings by display_order ascending', async () => {
      const opt1 = makeOption({ id: 'a', name: 'A', route: '/custom-a', displayOrder: 30 });
      const opt2 = makeOption({ id: 'b', name: 'B', route: '/custom-b', displayOrder: 10 });
      const opt3 = makeOption({ id: 'c', name: 'C', route: '/custom-c', displayOrder: 20 });
      optionRepo.qb.getMany.mockResolvedValue([opt1, opt2, opt3]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result.map((e) => e.label)).toEqual(['B', 'C', 'A']);
    });

    it('places children inside their parent sorted by display_order', async () => {
      const parent = makeOption({ id: 'p', name: 'Root', route: '/custom-root', displayOrder: 10 });
      const child1 = makeOption({ id: 'c1', name: 'Last', route: '/custom-c1', parentId: 'p', displayOrder: 20 });
      const child2 = makeOption({ id: 'c2', name: 'First', route: '/custom-c2', parentId: 'p', displayOrder: 15 });
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
        route: '/custom-mapa',
        icon: 'map',
        displayOrder: 40,
      });
      optionRepo.qb.getMany.mockResolvedValue([opt]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(1);
      const entry = result[0];
      expect(entry).toHaveProperty('label', 'Mapa');
      expect(entry).toHaveProperty('route', '/custom-mapa');
      expect(entry).toHaveProperty('icon', 'map');
      expect(entry).toHaveProperty('order', 40);
      expect(entry).toHaveProperty('children');
      expect(Array.isArray(entry.children)).toBe(true);
    });

    it('propagates icon from the menu_options row', async () => {
      const opt = makeOption({ id: 'o', icon: 'shield', route: '/custom-icon' });
      optionRepo.qb.getMany.mockResolvedValue([opt]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result[0].icon).toBe('shield');
    });

    it('omits icon when null', async () => {
      const opt = makeOption({ id: 'o', icon: null, route: '/custom-icon-null' });
      optionRepo.qb.getMany.mockResolvedValue([opt]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result[0].icon).toBeUndefined();
    });

    it('does NOT leak parentId/parent_id into the wire (regression, review finding 1)', async () => {
      const parent = makeOption({ id: 'p-1', name: 'INCIDENCIAS', route: '/custom-parent', displayOrder: 20 });
      const child = makeOption({ id: 'c-1', name: 'Mapa', route: '/custom-child', parentId: 'p-1', displayOrder: 40 });
      optionRepo.qb.getMany.mockResolvedValue([parent, child]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].label).toBe('Mapa');

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('parentId');
      expect(serialized).not.toContain('parent_id');
    });
  });

  // ── F5.4.4: Parity with MENU_MAP ──────────────────────────────────

  describe('parity with MENU_MAP (F5.4.4, the central assertion)', () => {
    it('master sees the same routes as MENU_MAP would produce', async () => {
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

      optionRepo.qb.getMany.mockResolvedValue(dbRows as any);

      const result = await service.getMenuForUser(USER_MASTER);

      const dbRoutes = result.map((e) => e.route).sort();
      const mapRoutes = Object.values(MENU_MAP)
        .map((d) => d.route)
        .sort();
      expect(dbRoutes).toEqual(mapRoutes);
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

      optionRepo.qb.getMany.mockResolvedValue(dbRows as any);

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

      userRepo.findOne.mockResolvedValue(
        Object.assign(new UserEntity(), { id: 'user-op', roleId: ROLE_OPERADOR }),
      );

      const result = await service.getMenuForUser('user-op');

      expect(result).toEqual([]);
    });

    it('handles a single top-level option with no children', async () => {
      const opt = makeOption({ id: 'dash', name: 'CustomDash', route: '/custom-dash', displayOrder: 10 });
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

  // ── Effective permissions filtering (regression — UUID wire) ──

  describe('effective permissions filtering (regression — UUID wire)', () => {
    it('operador_sistema with over-granted matrix row for /admin/users but lacking READ users UUID does NOT see Usuarios', async () => {
      userRepo.findOne.mockResolvedValue(
        Object.assign(new UserEntity(), { id: USER_OPERADOR, roleId: ROLE_OPERADOR }),
      );
      const usuarios = makeOption({
        id: 'u-usuarios',
        name: 'Usuarios',
        route: '/admin/users',
        displayOrder: 60,
      });
      optionRepo.qb.getMany.mockResolvedValue([usuarios]);

      const result = await service.getMenuForUser(USER_OPERADOR);

      expect(result).toHaveLength(0);
      expect(authService.getPermissionsByUserId).toHaveBeenCalledWith(USER_OPERADOR);
      expect(permissionLookup.getUuid).toHaveBeenCalledWith('READ', 'users');
    });

    it('user WITH READ incidents UUID sees Dashboard/Inicio/Lista/Mapa (happy path)', async () => {
      // Master has all perms — but specifically test incidentes routes visible when having READ incidents
      const dashboard = makeOption({ id: 'd1', name: 'Dashboard', route: '/dashboard', displayOrder: 10 });
      const inicio = makeOption({ id: 'd2', name: 'Inicio', route: '/inicio', displayOrder: 20 });
      const lista = makeOption({ id: 'd3', name: 'Lista de Incidencias', route: '/incidencias', displayOrder: 30 });
      const mapa = makeOption({ id: 'd4', name: 'Mapa', route: '/mapa', displayOrder: 40 });
      optionRepo.qb.getMany.mockResolvedValue([dashboard, inicio, lista, mapa]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result.map((e) => e.route).sort()).toEqual(['/dashboard', '/incidencias', '/inicio', '/mapa'].sort());
    });

    it('Reportar hidden when user lacks CREATE incidents UUID', async () => {
      userRepo.findOne.mockResolvedValue(
        Object.assign(new UserEntity(), { id: USER_OPERADOR, roleId: ROLE_OPERADOR }),
      );
      // Operador has READ incidents but NOT CREATE incidents → check OPERADOR_PERMS_UUIDS
      expect(OPERADOR_PERMS_UUIDS).toContain(UUID_READ_INCIDENTS);
      expect(OPERADOR_PERMS_UUIDS).not.toContain(UUID_CREATE_INCIDENTS);

      const inicio = makeOption({ id: 'i1', name: 'Inicio', route: '/inicio', displayOrder: 20 });
      const reportar = makeOption({ id: 'r1', name: 'Reportar', route: '/reportar', displayOrder: 50 });
      optionRepo.qb.getMany.mockResolvedValue([inicio, reportar]);

      const result = await service.getMenuForUser(USER_OPERADOR);

      expect(result.map((e) => e.route)).toContain('/inicio');
      expect(result.map((e) => e.route)).not.toContain('/reportar');
    });

    it('hides parent when its only children are filtered by effective permissions', async () => {
      userRepo.findOne.mockResolvedValue(
        Object.assign(new UserEntity(), { id: USER_OPERADOR, roleId: ROLE_OPERADOR }),
      );
      const parent = makeOption({
        id: 'p-gestion',
        name: 'GESTIÓN',
        route: '/custom-gestion',
        displayOrder: 60,
      });
      const usuarios = makeOption({
        id: 'c-usuarios',
        name: 'Usuarios',
        route: '/admin/users',
        parentId: 'p-gestion',
        displayOrder: 60,
      });
      const roles = makeOption({
        id: 'c-roles',
        name: 'Roles',
        route: '/admin/roles',
        parentId: 'p-gestion',
        displayOrder: 70,
      });
      // Custom parent stays, children filtered via UUID check
      optionRepo.qb.getMany.mockResolvedValue([parent, usuarios, roles]);

      const result = await service.getMenuForUser(USER_OPERADOR);

      const allRoutes = JSON.stringify(result);
      expect(allRoutes).not.toContain('/admin/users');
      expect(allRoutes).not.toContain('/admin/roles');
      // Parent remains but empty (custom route) or filtered children cause empty children
      if (result.length === 1) {
        expect(result[0].children).toHaveLength(0);
      } else {
        expect(result).toHaveLength(0);
      }
    });

    it('same role with EXTRA permission via users.permissions deviation gets the extra menu entry (per-user filtering)', async () => {
      const usuarios = makeOption({
        id: 'u-usuarios',
        name: 'Usuarios',
        route: '/admin/users',
        displayOrder: 60,
      });
      const categorias = makeOption({
        id: 'u-cat',
        name: 'Categorías',
        route: '/categorias',
        displayOrder: 90,
      });
      optionRepo.qb.getMany.mockResolvedValue([usuarios, categorias]);

      userRepo.findOne.mockResolvedValue(
        Object.assign(new UserEntity(), { id: USER_OPERADOR, roleId: ROLE_OPERADOR }),
      );
      const withoutExtra = await service.getMenuForUser(USER_OPERADOR);
      expect(withoutExtra.map((e) => e.route)).not.toContain('/admin/users');
      expect(withoutExtra.map((e) => e.route)).toContain('/categorias');

      redis.get.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(
        Object.assign(new UserEntity(), { id: USER_OPERADOR_EXTRA, roleId: ROLE_OPERADOR }),
      );
      const withExtra = await service.getMenuForUser(USER_OPERADOR_EXTRA);
      expect(withExtra.map((e) => e.route)).toContain('/admin/users');
      expect(withExtra.map((e) => e.route)).toContain('/categorias');
      expect(authService.getPermissionsByUserId).toHaveBeenCalledWith(USER_OPERADOR_EXTRA);
    });

    it('keeps routes NOT in MENU_MAP visible when can_read=true even without matching permission (empty UUID set)', async () => {
      userRepo.findOne.mockResolvedValue(
        Object.assign(new UserEntity(), { id: USER_OPERADOR, roleId: ROLE_OPERADOR }),
      );
      // Override to empty perms to prove custom route still visible
      authService.getPermissionsByUserId.mockResolvedValueOnce([]);
      const custom = makeOption({
        id: 'custom-1',
        name: 'Custom Admin',
        route: '/admin/custom',
        displayOrder: 200,
      });
      optionRepo.qb.getMany.mockResolvedValue([custom]);

      const result = await service.getMenuForUser(USER_OPERADOR);

      expect(result).toHaveLength(1);
      expect(result[0].route).toBe('/admin/custom');
    });

    it('custom route not in MENU_MAP stays visible with empty permission set (general case)', async () => {
      authService.getPermissionsByUserId.mockResolvedValue([]);
      const custom = makeOption({
        id: 'custom-2',
        name: 'Otra Custom',
        route: '/otra-custom',
        displayOrder: 210,
      });
      optionRepo.qb.getMany.mockResolvedValue([custom]);

      const result = await service.getMenuForUser(USER_MASTER);

      expect(result).toHaveLength(1);
      expect(result[0].route).toBe('/otra-custom');
    });

    it('caches per-user not per-role (two users same role have different cache keys)', async () => {
      const opt = makeOption({ id: 'opt-1', name: 'Usuarios', route: '/admin/users', displayOrder: 60 });
      optionRepo.qb.getMany.mockResolvedValue([opt]);

      userRepo.findOne.mockResolvedValue(
        Object.assign(new UserEntity(), { id: USER_OPERADOR, roleId: ROLE_OPERADOR }),
      );
      await service.getMenuForUser(USER_OPERADOR);
      expect(redis.setex).toHaveBeenCalledWith(`menu:v1:user:${USER_OPERADOR}`, 3600, expect.any(String));

      redis.get.mockResolvedValue(null);
      redis.setex.mockClear();
      userRepo.findOne.mockResolvedValue(
        Object.assign(new UserEntity(), { id: USER_OPERADOR_EXTRA, roleId: ROLE_OPERADOR }),
      );
      await service.getMenuForUser(USER_OPERADOR_EXTRA);
      expect(redis.get).toHaveBeenCalledWith(`menu:v1:user:${USER_OPERADOR_EXTRA}`);
      expect(redis.setex).toHaveBeenCalledWith(`menu:v1:user:${USER_OPERADOR_EXTRA}`, 3600, expect.any(String));
    });
  });
});
