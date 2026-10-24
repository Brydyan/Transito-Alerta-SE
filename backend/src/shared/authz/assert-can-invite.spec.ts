import { ForbiddenException } from '@nestjs/common';

import { assertCanInvite } from './assert-can-invite';
import { AuthContext } from './subject-scope';

function actor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'actor-1',
    permissions: [],
    organizationId: 'org-1',
    // 2026-10-18 — `departmentId` agregado al factory. Default null.
    departmentId: null,
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
    expect(() => assertCanInvite(a, 'org-1', 'operator_org')).not.toThrow();
  });

  it('org actor inviting into a DIFFERENT org: 403 OUT_OF_SCOPE_ORGANIZATION, not 404', () => {
    const a = actor({ roleName: 'admin_org', scope: { kind: 'org', organizationId: 'org-1' } });
    try {
      assertCanInvite(a, 'org-2', 'operator_org');
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
    expect(() => assertCanInvite(a, null, 'agent_system')).not.toThrow();
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
    const a = actor({ roleName: 'operator_org', scope: { kind: 'public' } });
    expect(() => assertCanInvite(a, 'org-1', 'reporter')).toThrow(ForbiddenException);
  });

  it('D2 additivity — actor with roleName=null (unranked) is never gated', () => {
    const a = actor({ roleName: null, scope: { kind: 'public' } });
    expect(() => assertCanInvite(a, 'org-9', 'master')).not.toThrow();
  });

  // 2026-10-18-admin-org-dept-scoping — admin_org con dept poblado.
  // Riesgo oculto detectado: el switch original no tenía case
  // 'department' → `undefined` → assertCanInvite NO chequeaba la org
  // → admin_org con scope 'department' podría invitar a CUALQUIER org.
  // La restricción de dept del user invitado vive en el flujo de
  // aceptación downstream; aquí se valida la org match.
  describe('department scope (2026-10-18 hidden risk fix)', () => {
    function deptScopeActor(overrides: Partial<AuthContext> = {}): AuthContext {
      return actor({
        roleName: 'admin_org',
        organizationId: 'org-1',
        departmentId: 'dept-A',
        scope: { kind: 'department', organizationId: 'org-1', departmentId: 'dept-A' },
        ...overrides,
      });
    }

    it('admin_org con department scope puede invitar en su propia org (lower-rank role)', () => {
      const a = deptScopeActor();
      expect(() => assertCanInvite(a, 'org-1', 'operator_org')).not.toThrow();
    });

    it('admin_org con department scope NO puede invitar en OTRA org → 403 OUT_OF_SCOPE_ORGANIZATION', () => {
      const a = deptScopeActor();
      try {
        assertCanInvite(a, 'org-2', 'operator_org');
        fail('expected ForbiddenException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          code: 'OUT_OF_SCOPE_ORGANIZATION',
        });
      }
    });

    it('admin_org con department scope + rank superior → 403 INSUFFICIENT_ROLE_RANK', () => {
      const a = deptScopeActor();
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
  });
});
