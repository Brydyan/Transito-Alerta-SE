import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { assertCanManage, assertVisible } from './assert-can-manage';
import { AuthContext } from './subject-scope';

function actor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'actor-1',
    permissions: [],
    organizationId: 'org-1',
    roleName: 'admin_org',
    scope: { kind: 'org', organizationId: 'org-1' },
    sessionId: 'session-actor-1',
    isAnonymous: false,
    ...overrides,
  };
}

describe('assertCanManage', () => {
  it('throws 404 NotFoundException when the target is not visible under the actor scope (cross-org)', () => {
    const a = actor({ scope: { kind: 'org', organizationId: 'org-1' } });
    const target = { id: 'target-1', organizationId: 'org-2', roleName: 'operador_org' };
    expect(() => assertCanManage(a, target)).toThrow(NotFoundException);
  });

  it('throws 403 INSUFFICIENT_ROLE_RANK when target is visible but out-ranked', () => {
    const a = actor({
      roleName: 'admin_org',
      organizationId: 'org-1',
      scope: { kind: 'org', organizationId: 'org-1' },
    });
    const target = { id: 'target-1', organizationId: 'org-1', roleName: 'master' };
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
      roleName: 'master',
      organizationId: null,
      scope: { kind: 'global' },
    });
    const target = { id: 'target-2', organizationId: null, roleName: 'master' };
    expect(() => assertCanManage(a, target)).toThrow(ForbiddenException);
  });

  it('does not throw when actor outranks a visible target', () => {
    const a = actor({
      roleName: 'master',
      organizationId: null,
      scope: { kind: 'global' },
    });
    const target = { id: 'target-3', organizationId: 'org-9', roleName: 'operador_org' };
    expect(() => assertCanManage(a, target)).not.toThrow();
  });

  it('global scope sees every org (visibility never blocks a global actor)', () => {
    const a = actor({ roleName: 'master', organizationId: null, scope: { kind: 'global' } });
    const target = { id: 'target-4', organizationId: 'org-42', roleName: 'reporter' };
    expect(() => assertCanManage(a, target)).not.toThrow();
  });

  it('deny scope makes every target invisible -> 404', () => {
    const a = actor({
      roleName: 'admin_org',
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
    const target = { id: 'target-6', organizationId: 'org-9', roleName: 'master' };
    expect(() => assertCanManage(a, target)).not.toThrow();
  });
});

/**
 * assertVisible (T3.9 design §8 D9 — promoted out of assertCanManage,
 * zero behaviour change). assertCanManage's own suite above proves the
 * refactor did not change ITS behaviour; this suite proves the promoted
 * function is independently usable (visibility only, no rank gate) — the
 * exact need `GET /users/:id/sessions` has (D9: reads need visibility
 * without rank).
 */
describe('assertVisible', () => {
  it('throws 404 when the target is not visible under the actor scope', () => {
    const a = actor({ scope: { kind: 'org', organizationId: 'org-1' } });
    const target = { id: 'target-1', organizationId: 'org-2', roleName: 'operador_org' };
    expect(() => assertVisible(a, target)).toThrow(NotFoundException);
  });

  it('does not throw when the target is visible, regardless of rank', () => {
    const a = actor({
      roleName: 'operador_org',
      organizationId: 'org-1',
      scope: { kind: 'org', organizationId: 'org-1' },
    });
    // Higher-ranked target than the actor — assertCanManage would 403 this,
    // but assertVisible only cares about visibility.
    const target = { id: 'target-1', organizationId: 'org-1', roleName: 'master' };
    expect(() => assertVisible(a, target)).not.toThrow();
  });

  it('global scope sees every org', () => {
    const a = actor({ roleName: 'master', organizationId: null, scope: { kind: 'global' } });
    const target = { id: 'target-4', organizationId: 'org-42', roleName: 'reporter' };
    expect(() => assertVisible(a, target)).not.toThrow();
  });

  it('public scope only sees self', () => {
    const a = actor({ userId: 'self-1', roleName: null, scope: { kind: 'public' } });
    expect(() =>
      assertVisible(a, { id: 'self-1', organizationId: null, roleName: null }),
    ).not.toThrow();
    expect(() =>
      assertVisible(a, { id: 'other-1', organizationId: null, roleName: null }),
    ).toThrow(NotFoundException);
  });
});
