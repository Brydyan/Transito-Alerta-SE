import { resolveSubjectScope } from './resolve-subject-scope';

describe('resolveSubjectScope', () => {
  it('master (any org) -> global', () => {
    expect(resolveSubjectScope('master', null)).toEqual({ kind: 'global' });
    expect(resolveSubjectScope('master', 'org-1')).toEqual({ kind: 'global' });
  });

  it('operador_sistema (any org) -> global, explicit branch by name', () => {
    expect(resolveSubjectScope('operador_sistema', null)).toEqual({ kind: 'global' });
    expect(resolveSubjectScope('operador_sistema', 'org-1')).toEqual({ kind: 'global' });
  });

  it('admin_org with organizationId set -> org', () => {
    expect(resolveSubjectScope('admin_org', 'org-1')).toEqual({
      kind: 'org',
      organizationId: 'org-1',
    });
  });

  it('admin_org with organizationId NULL -> deny', () => {
    expect(resolveSubjectScope('admin_org', null)).toEqual({
      kind: 'deny',
      reason: 'staff_without_organization',
    });
  });

  it('operador_org with organizationId set -> org_assigned', () => {
    expect(resolveSubjectScope('operador_org', 'org-1', 'user-1')).toEqual({
      kind: 'org_assigned',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('operador_org with organizationId NULL -> deny', () => {
    expect(resolveSubjectScope('operador_org', null, 'user-1')).toEqual({
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
