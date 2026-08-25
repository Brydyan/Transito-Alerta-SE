import { ForbiddenException } from '@nestjs/common';

import { assertCanInvite } from './assert-can-invite';
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

describe('assertCanInvite (T3.6 design D10)', () => {
  it('org actor inviting into their own org, granting a lower-rank role, does not throw', () => {
    const a = actor({ roleName: 'admin_org', scope: { kind: 'org', organizationId: 'org-1' } });
    expect(() => assertCanInvite(a, 'org-1', 'operador_org')).not.toThrow();
  });

  it('org actor inviting into a DIFFERENT org: 403 OUT_OF_SCOPE_ORGANIZATION, not 404', () => {
    const a = actor({ roleName: 'admin_org', scope: { kind: 'org', organizationId: 'org-1' } });
    try {
      assertCanInvite(a, 'org-2', 'operador_org');
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        code: 'OUT_OF_SCOPE_ORGANIZATION',
      });
    }
  });

  it('global actor may invite into any organization', () => {
    const a = actor({ roleName: 'master', organizationId: null, scope: { kind: 'global' } });
    expect(() => assertCanInvite(a, 'any-org', 'admin_org')).not.toThrow();
  });

  it('global actor may invite into a null organization (system-level invite)', () => {
    const a = actor({ roleName: 'master', organizationId: null, scope: { kind: 'global' } });
    expect(() => assertCanInvite(a, null, 'operador_sistema')).not.toThrow();
  });

  it('rank check runs after the scope check — inviting a same-or-higher rank role is 403 INSUFFICIENT_ROLE_RANK', () => {
    const a = actor({ roleName: 'admin_org', scope: { kind: 'org', organizationId: 'org-1' } });
    try {
      assertCanInvite(a, 'org-1', 'master');
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        code: 'INSUFFICIENT_ROLE_RANK',
      });
    }
  });

  it('public/deny scope actors can never invite (403 OUT_OF_SCOPE_ORGANIZATION)', () => {
    const a = actor({ roleName: 'operador_org', scope: { kind: 'public' } });
    expect(() => assertCanInvite(a, 'org-1', 'reporter')).toThrow(ForbiddenException);
  });

  it('D2 additivity — actor with roleName=null (unranked) is never gated', () => {
    const a = actor({ roleName: null, scope: { kind: 'public' } });
    expect(() => assertCanInvite(a, 'org-9', 'master')).not.toThrow();
  });
});
