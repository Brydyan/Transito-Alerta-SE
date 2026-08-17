import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { assertCanManage } from './assert-can-manage';
import { AuthContext } from './subject-scope';

function actor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'actor-1',
    permissions: [],
    organizationId: 'org-1',
    roleName: 'admin_organizacion',
    scope: { kind: 'org', organizationId: 'org-1' },
    ...overrides,
  };
}

describe('assertCanManage', () => {
  it('throws 404 NotFoundException when the target is not visible under the actor scope (cross-org)', () => {
    const a = actor({ scope: { kind: 'org', organizationId: 'org-1' } });
    const target = { id: 'target-1', organizationId: 'org-2', roleName: 'operador_organizacion' };
    expect(() => assertCanManage(a, target)).toThrow(NotFoundException);
  });

  it('throws 403 INSUFFICIENT_ROLE_RANK when target is visible but out-ranked', () => {
    const a = actor({
      roleName: 'admin_organizacion',
      organizationId: 'org-1',
      scope: { kind: 'org', organizationId: 'org-1' },
    });
    const target = { id: 'target-1', organizationId: 'org-1', roleName: 'admin_sistema' };
    try {
      assertCanManage(a, target);
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        code: 'INSUFFICIENT_ROLE_RANK',
      });
    }
  });

  it('equal rank is blocked (403)', () => {
    const a = actor({
      userId: 'actor-1',
      roleName: 'admin_sistema',
      organizationId: null,
      scope: { kind: 'global' },
    });
    const target = { id: 'target-2', organizationId: null, roleName: 'admin_sistema' };
    expect(() => assertCanManage(a, target)).toThrow(ForbiddenException);
  });

  it('does not throw when actor outranks a visible target', () => {
    const a = actor({
      roleName: 'admin_sistema',
      organizationId: null,
      scope: { kind: 'global' },
    });
    const target = { id: 'target-3', organizationId: 'org-9', roleName: 'operador_organizacion' };
    expect(() => assertCanManage(a, target)).not.toThrow();
  });

  it('global scope sees every org (visibility never blocks a global actor)', () => {
    const a = actor({ roleName: 'admin_sistema', organizationId: null, scope: { kind: 'global' } });
    const target = { id: 'target-4', organizationId: 'org-42', roleName: 'reporter' };
    expect(() => assertCanManage(a, target)).not.toThrow();
  });

  it('deny scope makes every target invisible -> 404', () => {
    const a = actor({
      roleName: 'admin_organizacion',
      organizationId: null,
      scope: { kind: 'deny', reason: 'staff_without_organization' },
    });
    const target = { id: 'target-5', organizationId: 'org-1', roleName: 'reporter' };
    expect(() => assertCanManage(a, target)).toThrow(NotFoundException);
  });

  // D2 additivity (found during e2e regression verification): an actor
  // with no seeded role (role_id IS NULL) held ASSIGN/UPDATE permissions
  // directly, pre-T3.2, gated only by PermissionGuard — this check must
  // not retroactively restrict them.
  it('does not throw for an actor with roleName=null (unranked, D2 additivity)', () => {
    const a = actor({ roleName: null, organizationId: null, scope: { kind: 'public' } });
    const target = { id: 'target-6', organizationId: 'org-9', roleName: 'admin_sistema' };
    expect(() => assertCanManage(a, target)).not.toThrow();
  });
});
