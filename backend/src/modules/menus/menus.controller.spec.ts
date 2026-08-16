import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

describe('MenusController', () => {
  let service: { getMenuForUser: jest.Mock };
  let controller: MenusController;

  beforeEach(() => {
    service = { getMenuForUser: jest.fn() };
    controller = new MenusController(service as unknown as MenusService);
  });

  it('GET / delegates to service.getMenuForUser with request.user.userId', async () => {
    service.getMenuForUser.mockResolvedValue([{ label: 'Incidents', route: '/incidents' }]);

    const request = { user: { userId: 'user-1', permissions: ['READ incidents'] } } as unknown as Express.Request;
    const result = await controller.getMenu(request);

    expect(service.getMenuForUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([{ label: 'Incidents', route: '/incidents' }]);
  });
});
