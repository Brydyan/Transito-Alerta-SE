import { Reflector } from '@nestjs/core';
import { MenuOptionsController } from './menu-options.controller';
import { MenuOptionsService } from './menu-options.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

/**
 * F5.5.4 — MenuOptionsController permission metadata tests.
 *
 * Validates that every endpoint enforces the correct permission
 * via @RequirePermission decorator. Follows the pattern from
 * roles.controller.spec.ts.
 */
describe('MenuOptionsController', () => {
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    getRoleMatrix: jest.Mock;
    setRoleAccess: jest.Mock;
    assignEndpoints: jest.Mock;
    getEndpointCatalog: jest.Mock;
  };
  let controller: MenuOptionsController;
  let reflector: Reflector;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getRoleMatrix: jest.fn(),
      setRoleAccess: jest.fn(),
      assignEndpoints: jest.fn(),
      getEndpointCatalog: jest.fn(),
    };
    controller = new MenuOptionsController(service as unknown as MenuOptionsService);
    reflector = new Reflector();
  });

  it('GET /menu-options requires READ permission', () => {
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.findAll);
    expect(meta).toEqual({ action: 'READ', resource: 'menu-options' });
  });

  it('GET /menu-options/:id requires READ permission', () => {
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.findOne);
    expect(meta).toEqual({ action: 'READ', resource: 'menu-options' });
  });

  it('POST /menu-options requires CREATE permission', () => {
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.create);
    expect(meta).toEqual({ action: 'CREATE', resource: 'menu-options' });
  });

  it('PATCH /menu-options/:id requires UPDATE permission', () => {
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.update);
    expect(meta).toEqual({ action: 'UPDATE', resource: 'menu-options' });
  });

  it('DELETE /menu-options/:id requires DELETE permission', () => {
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.delete);
    expect(meta).toEqual({ action: 'DELETE', resource: 'menu-options' });
  });

  it('GET /menu-options/:id/roles requires READ permission', () => {
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.getRoleMatrix);
    expect(meta).toEqual({ action: 'READ', resource: 'menu-options' });
  });

  it('PUT /menu-options/:id/roles/:roleId requires UPDATE permission', () => {
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.setRoleAccess);
    expect(meta).toEqual({ action: 'UPDATE', resource: 'menu-options' });
  });

  it('PUT /menu-options/:id/endpoints requires UPDATE permission', () => {
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.assignEndpoints);
    expect(meta).toEqual({ action: 'UPDATE', resource: 'menu-options' });
  });

  it('GET /menu-options/endpoints requires READ permission', () => {
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.getEndpointCatalog);
    expect(meta).toEqual({ action: 'READ', resource: 'menu-options' });
  });
});
