import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { REDIS_CLIENT } from '../../core/core.module';
import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { UserEntity } from '../../entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { PermissionLookupService } from '../../common/permissions/permission-lookup.service';
import { MenusService } from './menus.service';

/**
 * MenusService — unit tests for the DB-backed resolution (F5).
 *
 * F6 fix (post-0051): permissions are UUIDs, not strings like 'READ incidents'.
 * Every mock for AuthService.getPermissionsByUserId MUST return UUIDs,
 * and PermissionLookupService.getUuid must be mocked to translate
 * (action, resource) → UUID. The previous bug used permissionSet.has('READ incidents')
 * against a Set of UUIDs — always false → empty menu in production.
 */

// Real UUIDs from postgres `permissions` table (used as canonical contract)
const UUID_READ_INCIDENTS = 'a71d3d2a-9a37-4db8-9119-1c826d52db74';
const UUID_CREATE_INCIDENTS = '88f176b6-4383-491b-9342-a4ee7fcabab5';
const UUID_READ_INCIDENT_CATEGORIES = '4700839b-1bfb-4785-9147-62942036456c';
const UUID_READ_GEO_ZONES = '85b875fd-2799-47f8-9bed-2980cfefc207';
const UUID_READ_ORGANIZATIONS = '84de7209-9a21-45fd-a761-d3004c87ba30';
const UUID_READ_USERS = 'f495d231-f3ae-4b41-a0b7-a7fb8b742d2a';
const UUID_READ_ROLES = '64cabc44-7181-40fe-86af-9de857e83646';

// MENU_MAP requires → UUID lookup table (mirrors production catalog)
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
    getUuid: jest.fn(async (action: string, resource: string) => {
      return PERM_LOOKUP_MAP.get(`${action} ${resource}`) ?? null;
    }),
    getUuidSync: jest.fn((action: string, resource: string) => {
      return PERM_LOOKUP_MAP.get(`${action} ${resource}`) ?? null;
    }),
    buildCache: jest.fn(),
    invalidate: jest.fn(),
  };
}

describe('MenusService', () => {
  let service: MenusService;
  let optionRepo: { qb: { getMany: jest.Mock }; createQueryBuilder: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let redis: { get: jest.Mock; setex: jest.Mock; del: jest.Mock; keys: jest.Mock };
  let authService: { getPermissionsByUserId: jest.Mock };
  let permissionLookup: ReturnType<typeof makePermissionLookupMock>;

  const ROLE_MASTER = '11111111-1111-1111-1111-111111111111';
  const USER_MASTER = 'user-master';

  // Full permission set for master — all UUIDs
  const ALL_PERMS_UUIDS = [...PERM_LOOKUP_MAP.values()];

  beforeEach(async () => {
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    optionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      qb,
    };
    userRepo = { findOne: jest.fn() };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(0),
      keys: jest.fn().mockResolvedValue([]),
    };
    authService = {
      getPermissionsByUserId: jest.fn().mockResolvedValue(ALL_PERMS_UUIDS),
    };
    permissionLookup = makePermissionLookupMock();

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

  it('resolves the user role before querying menu options', async () => {
    await service.getMenuForUser(USER_MASTER);

    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { id: USER_MASTER, deletedAt: expect.anything() },
      select: ['id', 'roleId'],
    });
  });

  it('returns empty array when user has no role_id', async () => {
    userRepo.findOne.mockResolvedValue(
      Object.assign(new UserEntity(), { id: 'anon', roleId: null }),
    );

    const result = await service.getMenuForUser('anon');

    expect(result).toEqual([]);
    expect(optionRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns empty array when user is not found', async () => {
    userRepo.findOne.mockResolvedValue(null);

    const result = await service.getMenuForUser('nonexistent');

    expect(result).toEqual([]);
    expect(optionRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('builds tree from flat DB results', async () => {
    const parent = Object.assign(new MenuOptionEntity(), {
      id: 'p', name: 'Gestión', route: '/gestion', icon: 'settings',
      parentId: null, displayOrder: 50, isActive: true, deletedAt: null,
    });
    const child = Object.assign(new MenuOptionEntity(), {
      id: 'c', name: 'Usuarios', route: '/admin/users', icon: 'users',
      parentId: 'p', displayOrder: 60, isActive: true, deletedAt: null,
    });
    optionRepo.qb.getMany.mockResolvedValue([parent, child]);

    const result = await service.getMenuForUser(USER_MASTER);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Gestión');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].label).toBe('Usuarios');
  });

  it('orders root nodes by display_order', async () => {
    const a = Object.assign(new MenuOptionEntity(), {
      id: 'a', name: 'Zebra', route: '/z', parentId: null, displayOrder: 100,
      isActive: true, deletedAt: null,
    });
    const b = Object.assign(new MenuOptionEntity(), {
      id: 'b', name: 'Alpha', route: '/a', parentId: null, displayOrder: 10,
      isActive: true, deletedAt: null,
    });
    optionRepo.qb.getMany.mockResolvedValue([a, b]);

    const result = await service.getMenuForUser(USER_MASTER);

    expect(result.map((e) => e.label)).toEqual(['Alpha', 'Zebra']);
  });

  it('caches the result in Redis with user-based key', async () => {
    optionRepo.qb.getMany.mockResolvedValue([]);

    await service.getMenuForUser(USER_MASTER);

    expect(redis.setex).toHaveBeenCalledWith(
      `menu:v1:user:${USER_MASTER}`,
      3600,
      '[]',
    );
  });

  it('returns cached result when available', async () => {
    const cached = [{ label: 'Cached', route: '/cached', order: 10, children: [] }];
    redis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getMenuForUser(USER_MASTER);

    expect(result).toEqual(cached);
    expect(optionRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('invalidateCache removes all menu:v1:* keys', async () => {
    redis.keys.mockResolvedValue(['menu:v1:user:1', 'menu:v1:user:2']);

    await service.invalidateCache();

    expect(redis.keys).toHaveBeenCalledWith('menu:v1:*');
    expect(redis.del).toHaveBeenCalledWith('menu:v1:user:1', 'menu:v1:user:2');
  });

  // ── Effective permissions filtering (regression — UUID wire format) ──

  it('filters out options whose route requires a permission the user lacks (UUID comparison)', async () => {
    // User has only READ incidents UUID, lacks READ users UUID
    authService.getPermissionsByUserId.mockResolvedValue([UUID_READ_INCIDENTS]);
    const opt = Object.assign(new MenuOptionEntity(), {
      id: 'u1',
      name: 'Usuarios',
      route: '/admin/users',
      icon: 'users',
      parentId: null,
      displayOrder: 60,
      isActive: true,
      deletedAt: null,
    });
    optionRepo.qb.getMany.mockResolvedValue([opt]);

    const result = await service.getMenuForUser(USER_MASTER);

    expect(result).toHaveLength(0);
    expect(permissionLookup.getUuid).toHaveBeenCalledWith('READ', 'users');
  });

  it('keeps custom routes not in MENU_MAP even when user lacks any mapped permission (UUID set empty)', async () => {
    authService.getPermissionsByUserId.mockResolvedValue([]);
    const opt = Object.assign(new MenuOptionEntity(), {
      id: 'custom-1',
      name: 'Custom Admin',
      route: '/admin/custom',
      icon: null,
      parentId: null,
      displayOrder: 200,
      isActive: true,
      deletedAt: null,
    });
    optionRepo.qb.getMany.mockResolvedValue([opt]);

    const result = await service.getMenuForUser(USER_MASTER);

    expect(result).toHaveLength(1);
    expect(result[0].route).toBe('/admin/custom');
  });

  it('user WITH READ incidents UUID sees Dashboard/Inicio/Lista/Mapa (happy path)', async () => {
    authService.getPermissionsByUserId.mockResolvedValue([UUID_READ_INCIDENTS]);
    const dashboard = Object.assign(new MenuOptionEntity(), {
      id: 'd1', name: 'Dashboard', route: '/dashboard', parentId: null, displayOrder: 10, isActive: true, deletedAt: null,
    });
    const inicio = Object.assign(new MenuOptionEntity(), {
      id: 'd2', name: 'Inicio', route: '/inicio', parentId: null, displayOrder: 20, isActive: true, deletedAt: null,
    });
    const lista = Object.assign(new MenuOptionEntity(), {
      id: 'd3', name: 'Lista de Incidencias', route: '/incidencias', parentId: null, displayOrder: 30, isActive: true, deletedAt: null,
    });
    const mapa = Object.assign(new MenuOptionEntity(), {
      id: 'd4', name: 'Mapa', route: '/mapa', parentId: null, displayOrder: 40, isActive: true, deletedAt: null,
    });
    optionRepo.qb.getMany.mockResolvedValue([dashboard, inicio, lista, mapa]);

    const result = await service.getMenuForUser(USER_MASTER);

    expect(result.map((e) => e.route).sort()).toEqual(['/dashboard', '/incidencias', '/inicio', '/mapa'].sort());
  });

  it('Reportar hidden when user lacks CREATE incidents UUID (but has READ incidents)', async () => {
    authService.getPermissionsByUserId.mockResolvedValue([UUID_READ_INCIDENTS]); // no CREATE
    const reportar = Object.assign(new MenuOptionEntity(), {
      id: 'r1', name: 'Reportar', route: '/reportar', parentId: null, displayOrder: 50, isActive: true, deletedAt: null,
    });
    const inicio = Object.assign(new MenuOptionEntity(), {
      id: 'r2', name: 'Inicio', route: '/inicio', parentId: null, displayOrder: 20, isActive: true, deletedAt: null,
    });
    optionRepo.qb.getMany.mockResolvedValue([inicio, reportar]);

    const result = await service.getMenuForUser(USER_MASTER);

    expect(result.map((e) => e.route)).toContain('/inicio');
    expect(result.map((e) => e.route)).not.toContain('/reportar');
    expect(permissionLookup.getUuid).toHaveBeenCalledWith('CREATE', 'incidents');
  });

  it('operador_sistema with matrix can_read=true for /admin/users but WITHOUT READ users UUID does NOT see Usuarios', async () => {
    authService.getPermissionsByUserId.mockResolvedValue([UUID_READ_INCIDENTS, UUID_READ_ORGANIZATIONS]);
    const usuarios = Object.assign(new MenuOptionEntity(), {
      id: 'op1', name: 'Usuarios', route: '/admin/users', parentId: null, displayOrder: 60, isActive: true, deletedAt: null,
    });
    optionRepo.qb.getMany.mockResolvedValue([usuarios]);

    const result = await service.getMenuForUser(USER_MASTER);

    expect(result).toHaveLength(0);
  });

  it('parses resource with hyphen correctly via indexOf (incident-categories)', async () => {
    authService.getPermissionsByUserId.mockResolvedValue([UUID_READ_INCIDENT_CATEGORIES]);
    const opt = Object.assign(new MenuOptionEntity(), {
      id: 'cat1', name: 'Categorías', route: '/categorias', parentId: null, displayOrder: 90, isActive: true, deletedAt: null,
    });
    optionRepo.qb.getMany.mockResolvedValue([opt]);

    const result = await service.getMenuForUser(USER_MASTER);

    expect(result).toHaveLength(1);
    expect(permissionLookup.getUuid).toHaveBeenCalledWith('READ', 'incident-categories');
  });

  it('uses per-user cache key so two users of same role can have different menus', async () => {
    optionRepo.qb.getMany.mockResolvedValue([]);
    const userId2 = 'user-other-same-role';
    userRepo.findOne.mockResolvedValue(
      Object.assign(new UserEntity(), { id: userId2, roleId: ROLE_MASTER }),
    );

    await service.getMenuForUser(userId2);

    expect(redis.get).toHaveBeenCalledWith(`menu:v1:user:${userId2}`);
    expect(redis.setex).toHaveBeenCalledWith(`menu:v1:user:${userId2}`, 3600, '[]');
  });

  it('same role, extra permission via users.permissions deviation gets extra menu entry (per-user cache)', async () => {
    const usuarios = Object.assign(new MenuOptionEntity(), {
      id: 'u-usuarios', name: 'Usuarios', route: '/admin/users', displayOrder: 60, parentId: null, isActive: true, deletedAt: null,
    });
    const categorias = Object.assign(new MenuOptionEntity(), {
      id: 'u-cat', name: 'Categorías', route: '/categorias', displayOrder: 90, parentId: null, isActive: true, deletedAt: null,
    });
    optionRepo.qb.getMany.mockResolvedValue([usuarios, categorias]);

    // Without extra perm (only incident-categories)
    authService.getPermissionsByUserId.mockResolvedValue([UUID_READ_INCIDENT_CATEGORIES]);
    let result = await service.getMenuForUser(USER_MASTER);
    expect(result.map((e) => e.route)).not.toContain('/admin/users');
    expect(result.map((e) => e.route)).toContain('/categorias');

    // Same role, extra perm via different user
    redis.get.mockResolvedValue(null);
    const USER_EXTRA = 'user-extra-perm';
    userRepo.findOne.mockResolvedValue(Object.assign(new UserEntity(), { id: USER_EXTRA, roleId: ROLE_MASTER }));
    authService.getPermissionsByUserId.mockResolvedValue([UUID_READ_INCIDENT_CATEGORIES, UUID_READ_USERS]);
    result = await service.getMenuForUser(USER_EXTRA);
    expect(result.map((e) => e.route)).toContain('/admin/users');
    expect(result.map((e) => e.route)).toContain('/categorias');
  });
});
