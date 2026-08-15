import { Reflector } from '@nestjs/core';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('UsersController', () => {
  let service: {
    findById: jest.Mock;
    updateProfile: jest.Mock;
    updateAvatar: jest.Mock;
    list: jest.Mock;
  };
  let controller: UsersController;

  beforeEach(() => {
    service = {
      findById: jest.fn(),
      updateProfile: jest.fn(),
      updateAvatar: jest.fn(),
      list: jest.fn(),
    };
    controller = new UsersController(service as unknown as UsersService);
  });

  it('GET / (list) requires READ users', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.list);
    expect(meta).toEqual({ action: 'READ', resource: undefined });
  });

  it('GET /me delegates to service.findById with the authenticated user id', async () => {
    service.findById.mockResolvedValue({ id: 'u1' });
    const req = { user: { userId: 'u1', permissions: [] } } as any;

    const result = await controller.me(req);

    expect(service.findById).toHaveBeenCalledWith('u1');
    expect(result).toEqual({ id: 'u1' });
  });

  it('PATCH /me delegates to service.updateProfile', async () => {
    service.updateProfile.mockResolvedValue({ id: 'u1', firstName: 'Ana' });
    const req = { user: { userId: 'u1', permissions: [] } } as any;

    const result = await controller.updateProfile({ first_name: 'Ana' } as any, req);

    expect(service.updateProfile).toHaveBeenCalledWith('u1', { firstName: 'Ana', lastName: undefined });
    expect(result).toEqual({ id: 'u1', firstName: 'Ana' });
  });

  it('POST /me/avatar delegates to service.updateAvatar with the uploaded file', async () => {
    service.updateAvatar.mockResolvedValue({ id: 'u1', avatarUrl: 'https://x' });
    const req = { user: { userId: 'u1', permissions: [] } } as any;
    const file = { buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'a.png' } as any;

    const result = await controller.updateAvatar(file, req);

    expect(service.updateAvatar).toHaveBeenCalledWith('u1', file);
    expect(result).toEqual({ id: 'u1', avatarUrl: 'https://x' });
  });

  it('GET / delegates to service.list with pagination query params', async () => {
    service.list.mockResolvedValue({ items: [], total: 0 });

    await controller.list('2', '50');

    expect(service.list).toHaveBeenCalledWith(2, 50);
  });
});
