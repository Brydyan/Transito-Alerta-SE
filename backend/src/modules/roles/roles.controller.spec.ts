import { Reflector } from '@nestjs/core';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('RolesController', () => {
  let service: { listPermissions: jest.Mock; assignRole: jest.Mock };
  let controller: RolesController;

  beforeEach(() => {
    service = { listPermissions: jest.fn(), assignRole: jest.fn() };
    controller = new RolesController(service as unknown as RolesService);
  });

  it('GET /:id/permissions requires READ permission', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.listPermissions);
    expect(meta).toEqual({ action: 'READ', resource: undefined });
  });

  it('POST /:id/assign requires ASSIGN permission', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.assign);
    expect(meta).toEqual({ action: 'ASSIGN', resource: undefined });
  });

  it('GET /:id/permissions delegates to service.listPermissions', async () => {
    service.listPermissions.mockResolvedValue(['READ incidents']);

    const result = await controller.listPermissions('role-1');

    expect(service.listPermissions).toHaveBeenCalledWith('role-1');
    expect(result).toEqual(['READ incidents']);
  });

  it('POST /:id/assign delegates to service.assignRole', async () => {
    service.assignRole.mockResolvedValue({ id: 'user-1' });

    const result = await controller.assign('role-1', { user_id: 'user-1' } as unknown as Parameters<typeof controller.assign>[1]);

    expect(service.assignRole).toHaveBeenCalledWith('user-1', 'role-1');
    expect(result).toEqual({ id: 'user-1' });
  });
});
