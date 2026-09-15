import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { REDIS_CLIENT } from '../../core/core.module';
import { MenuOptionEntity } from './entities/menu-option.entity';
import { MenuOptionRoleEntity } from './entities/menu-option-role.entity';
import { UserEntity } from '../../entities/user.entity';
import { MenusService } from './menus.service';

/**
 * MenusService — unit tests for the DB-backed resolution (F5).
 *
 * These tests replace the old MENU_MAP-based tests. The MENU_MAP is
 * preserved in the repo as a rollback path (D7) and its own coherence
 * tests live in menu-map.spec.ts (D8).
 */
describe('MenusService', () => {
  let service: MenusService;
  let optionRepo: { qb: { getMany: jest.Mock }; createQueryBuilder: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let redis: { get: jest.Mock; setex: jest.Mock; del: jest.Mock; keys: jest.Mock };

  const ROLE_MASTER = '11111111-1111-1111-1111-111111111111';
  const USER_MASTER = 'user-master';

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
    // Should not query menu options at all
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

  it('caches the result in Redis with role-based key', async () => {
    optionRepo.qb.getMany.mockResolvedValue([]);

    await service.getMenuForUser(USER_MASTER);

    expect(redis.setex).toHaveBeenCalledWith(
      `menu:v1:role:${ROLE_MASTER}`,
      3600,
      '[]',
    );
  });

  it('returns cached result when available', async () => {
    const cached = [{ label: 'Cached', route: '/cached', order: 10, children: [] }];
    redis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getMenuForUser(USER_MASTER);

    expect(result).toEqual(cached);
    // Should not query DB
    expect(optionRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('invalidateCache removes all menu:v1:* keys', async () => {
    redis.keys.mockResolvedValue(['menu:v1:role:1', 'menu:v1:role:2']);

    await service.invalidateCache();

    expect(redis.keys).toHaveBeenCalledWith('menu:v1:role:*');
    expect(redis.del).toHaveBeenCalledWith('menu:v1:role:1', 'menu:v1:role:2');
  });
});
