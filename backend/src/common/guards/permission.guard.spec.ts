import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard, hasPermission } from './permission.guard';

function makeContext(path: string, permissions: string[] | undefined): ExecutionContext {
  const request = { path, user: permissions ? { permissions } : undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('hasPermission (pure function)', () => {
  it('returns true when the exact "ACTION resource" string is present', () => {
    expect(hasPermission(['READ incidents', 'CREATE incidents'], 'READ', 'incidents')).toBe(true);
  });

  it('returns false when the resource is present but the action is missing (default-deny, R7)', () => {
    expect(hasPermission(['READ incidents'], 'DELETE', 'incidents')).toBe(false);
  });
});

describe('PermissionGuard', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('allows the request when the user holds the required permission', () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ action: 'READ', resource: 'incidents' });
    const guard = new PermissionGuard(reflector);

    const result = guard.canActivate(makeContext('/api/incidents', ['READ incidents']));

    expect(result).toBe(true);
  });

  it('throws 403 Forbidden when the user lacks the required permission (CC1)', () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ action: 'DELETE', resource: 'incidents' });
    const guard = new PermissionGuard(reflector);

    expect(() => guard.canActivate(makeContext('/api/incidents', ['READ incidents']))).toThrow(
      ForbiddenException,
    );
  });

  it('infers the resource from the route path when the decorator omits it (D3)', () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ action: 'CREATE', resource: undefined });
    const guard = new PermissionGuard(reflector);

    const result = guard.canActivate(makeContext('/api/incidents', ['CREATE incidents']));

    expect(result).toBe(true);
  });

  it('allows the route through when no @RequirePermission metadata is set (public route)', () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const guard = new PermissionGuard(reflector);

    const result = guard.canActivate(makeContext('/api/health', undefined));

    expect(result).toBe(true);
  });
});
