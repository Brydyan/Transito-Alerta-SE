import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard, hasPermission } from './permission.guard';
import { PermissionLookupService } from '../permissions/permission-lookup.service';

function makeContext(path: string, permissions: string[] | undefined): ExecutionContext {
  const request = { path, user: permissions ? { permissions } : undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

/**
 * Lookup de prueba que traduce pares (action, resource) a UUIDs
 * fijos. Las pruebas del guard deben ser determinísticas, así
 * que este mock no toca la DB — pre-carga las entradas
 * relevantes.
 */
function makeStubLookup(entries: Array<[string, string, string]>): PermissionLookupService {
  const map = new Map<string, string>();
  for (const [action, resource, uuid] of entries) {
    map.set(`${action} ${resource}`, uuid);
  }
  const stub = {
    getUuid: jest.fn(async (action: string, resource: string) =>
      map.get(`${action} ${resource}`) ?? null,
    ),
  } as unknown as PermissionLookupService;
  return stub;
}

describe('hasPermission (F6: works with UUID-based perms)', () => {
  const READ_INCIDENTS = 'uuid-read-incidents';
  const CREATE_INCIDENTS = 'uuid-create-incidents';
  const lookup = makeStubLookup([
    ['READ', 'incidents', READ_INCIDENTS],
    ['CREATE', 'incidents', CREATE_INCIDENTS],
  ]);

  it('returns true when the UUID for (action, resource) is in the user perms', async () => {
    const ok = await hasPermission(
      [READ_INCIDENTS, CREATE_INCIDENTS],
      'READ',
      'incidents',
      lookup,
    );
    expect(ok).toBe(true);
  });

  it('returns false when the action is missing (default-deny, R7)', async () => {
    const ok = await hasPermission(
      [READ_INCIDENTS],
      'DELETE',
      'incidents',
      lookup,
    );
    expect(ok).toBe(false);
  });
});

describe('PermissionGuard', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('allows the request when the user holds the required permission (UUID)', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ action: 'READ', resource: 'incidents' });
    const lookup = makeStubLookup([['READ', 'incidents', 'uuid-read']]);
    const guard = new PermissionGuard(reflector, lookup);

    const result = await guard.canActivate(makeContext('/api/incidents', ['uuid-read']));

    expect(result).toBe(true);
  });

  it('throws 403 Forbidden when the user lacks the required permission (CC1)', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ action: 'DELETE', resource: 'incidents' });
    const lookup = makeStubLookup([['READ', 'incidents', 'uuid-read']]);
    const guard = new PermissionGuard(reflector, lookup);

    await expect(
      guard.canActivate(makeContext('/api/incidents', ['uuid-read'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('infers the resource from the route path when the decorator omits it (D3)', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ action: 'CREATE', resource: undefined });
    const lookup = makeStubLookup([['CREATE', 'incidents', 'uuid-create']]);
    const guard = new PermissionGuard(reflector, lookup);

    const result = await guard.canActivate(makeContext('/api/incidents', ['uuid-create']));

    expect(result).toBe(true);
  });

  it('allows the route through when no @RequirePermission metadata is set (public route)', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const lookup = makeStubLookup([]);
    const guard = new PermissionGuard(reflector, lookup);

    const result = await guard.canActivate(makeContext('/api/health', undefined));

    expect(result).toBe(true);
  });
});
