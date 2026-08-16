import { MenusService } from './menus.service';

describe('MenusService', () => {
  let authService: { getPermissionsByUserId: jest.Mock };
  let service: MenusService;

  beforeEach(() => {
    authService = { getPermissionsByUserId: jest.fn() };
    service = new MenusService(authService as Partial<typeof authService>);
  });

  it('resolves permissions via AuthService.getPermissionsByUserId (same cache path as PermissionGuard)', async () => {
    authService.getPermissionsByUserId.mockResolvedValue([]);

    await service.getMenuForUser('user-1');

    expect(authService.getPermissionsByUserId).toHaveBeenCalledWith('user-1');
  });

  it('a full-permission user sees every menu entry', async () => {
    authService.getPermissionsByUserId.mockResolvedValue([
      'READ incidents',
      'READ assignments',
      'READ comments',
      'READ users',
      'READ roles',
    ]);

    const result = await service.getMenuForUser('user-1');

    expect(result).toEqual(
      expect.arrayContaining([
        { label: 'Incidents', route: '/incidents', icon: 'alert-triangle' },
        { label: 'Assignments', route: '/assignments', icon: 'clipboard-list' },
        { label: 'Comments', route: '/comments', icon: 'message-circle' },
        { label: 'Users', route: '/users', icon: 'users' },
        { label: 'Roles', route: '/roles', icon: 'shield' },
      ]),
    );
    expect(result).toHaveLength(5);
  });

  // R16 core acceptance criterion: a user lacking READ assignments must not
  // see the Assignments menu entry.
  it('a user lacking READ assignments does not see the Assignments entry', async () => {
    authService.getPermissionsByUserId.mockResolvedValue(['READ incidents']);

    const result = await service.getMenuForUser('user-1');

    expect(result).toEqual([{ label: 'Incidents', route: '/incidents', icon: 'alert-triangle' }]);
    expect(result.find((entry) => entry.label === 'Assignments')).toBeUndefined();
  });

  it('a user with no permissions sees an empty menu', async () => {
    authService.getPermissionsByUserId.mockResolvedValue([]);

    const result = await service.getMenuForUser('user-1');

    expect(result).toEqual([]);
  });
});
