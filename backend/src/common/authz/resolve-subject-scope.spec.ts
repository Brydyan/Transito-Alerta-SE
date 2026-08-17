import { resolveSubjectScope } from './resolve-subject-scope';

describe('resolveSubjectScope', () => {
  it('admin_sistema (any org) -> global', () => {
    expect(resolveSubjectScope('admin_sistema', null)).toEqual({ kind: 'global' });
    expect(resolveSubjectScope('admin_sistema', 'org-1')).toEqual({ kind: 'global' });
  });

  it('operador_sistema (any org) -> global, explicit branch by name', () => {
    expect(resolveSubjectScope('operador_sistema', null)).toEqual({ kind: 'global' });
    expect(resolveSubjectScope('operador_sistema', 'org-1')).toEqual({ kind: 'global' });
  });

  it('admin_organizacion with organizationId set -> org', () => {
    expect(resolveSubjectScope('admin_organizacion', 'org-1')).toEqual({
      kind: 'org',
      organizationId: 'org-1',
    });
  });

  it('admin_organizacion with organizationId NULL -> deny', () => {
    expect(resolveSubjectScope('admin_organizacion', null)).toEqual({
      kind: 'deny',
      reason: 'staff_without_organization',
    });
  });

  it('operador_organizacion with organizationId set -> org_assigned', () => {
    expect(resolveSubjectScope('operador_organizacion', 'org-1', 'user-1')).toEqual({
      kind: 'org_assigned',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('operador_organizacion with organizationId NULL -> deny', () => {
    expect(resolveSubjectScope('operador_organizacion', null, 'user-1')).toEqual({
      kind: 'deny',
      reason: 'staff_without_organization',
    });
  });

  it('reporter (any org) -> public', () => {
    expect(resolveSubjectScope('reporter', null)).toEqual({ kind: 'public' });
    expect(resolveSubjectScope('reporter', 'org-1')).toEqual({ kind: 'public' });
  });

  it('role_id IS NULL (unranked / unknown role) -> public, default branch', () => {
    expect(resolveSubjectScope(null, null)).toEqual({ kind: 'public' });
    expect(resolveSubjectScope('some_future_role', 'org-1')).toEqual({ kind: 'public' });
  });
});
