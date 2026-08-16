import { Reflector } from '@nestjs/core';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('PermissionsController', () => {
  let service: { findAll: jest.Mock };
  let controller: PermissionsController;

  beforeEach(() => {
    service = { findAll: jest.fn() };
    controller = new PermissionsController(service as unknown as PermissionsService);
  });

  it('GET / requires READ permission', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.findAll);
    expect(meta).toEqual({ action: 'READ', resource: undefined });
  });

  it('GET / delegates to service.findAll', async () => {
    service.findAll.mockResolvedValue([{ id: 'p-1' }]);

    const result = await controller.findAll();

    expect(result).toEqual([{ id: 'p-1' }]);
  });
});
