import { resolveSubjectScope } from './resolve-subject-scope';

describe('resolveSubjectScope', () => {
  // master y agent_system — unchanged por el scope change.
  it('master (any org) -> global', () => {
    expect(resolveSubjectScope('master', null, null)).toEqual({ kind: 'global' });
    expect(resolveSubjectScope('master', 'org-1', null)).toEqual({ kind: 'global' });
  });

  it('agent_system (any org) -> global, explicit branch by name', () => {
    expect(resolveSubjectScope('agent_system', null, null)).toEqual({ kind: 'global' });
    expect(resolveSubjectScope('agent_system', 'org-1', null)).toEqual({ kind: 'global' });
  });

  // 2026-10-18-admin-org-dept-scoping — admin_org ahora resuelve
  // a `'department'` cuando tiene departmentId poblado; cae a
  // `'org'` cuando NO lo tiene (back-compat para admin_org sin
  // departamento asignado — no debería pasar en práctica, pero la
  // guarda evita un deny inesperado si el seed olvida setearlo).
  describe('admin_org (2026-10-18 dept scoping)', () => {
    it('admin_org con orgId + departmentId → kind: "department"', () => {
      expect(
        resolveSubjectScope('admin_org', 'org-1', 'dept-A', 'user-1'),
      ).toEqual({
        kind: 'department',
        organizationId: 'org-1',
        departmentId: 'dept-A',
      });
    });

    it('admin_org con orgId pero sin departmentId → fallback a "org" (back-compat)', () => {
      expect(
        resolveSubjectScope('admin_org', 'org-1', null, 'user-1'),
      ).toEqual({ kind: 'org', organizationId: 'org-1' });
    });

    it('admin_org con orgId + departmentId null es equivalente a back-compat', () => {
      expect(
        resolveSubjectScope('admin_org', 'org-1', null, 'user-1'),
      ).toEqual({ kind: 'org', organizationId: 'org-1' });
    });

    it('admin_org sin orgId (caso legacy) → deny', () => {
      expect(
        resolveSubjectScope('admin_org', null, null, 'user-1'),
      ).toEqual({
        kind: 'deny',
        reason: 'staff_without_organization',
      });
    });
  });

  // operator_org — unchanged. Sigue siendo 'org_assigned'.
  it('operator_org con organizationId set -> org_assigned', () => {
    expect(
      resolveSubjectScope('operator_org', 'org-1', null, 'user-1'),
    ).toEqual({
      kind: 'org_assigned',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('operator_org con departmentId es IGNORADO (no scope dept — sigue org_assigned)', () => {
    // Defense-in-depth: operator_org NO debería estar en un department
    // (su scope es "ver sólo mis assignments"). Si en el futuro se le
    // llega a poblar departmentId, NO debe cambiar su scope.
    expect(
      resolveSubjectScope('operator_org', 'org-1', 'dept-A', 'user-1'),
    ).toEqual({
      kind: 'org_assigned',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('operator_org con organizationId NULL -> deny', () => {
    expect(resolveSubjectScope('operator_org', null, null, 'user-1')).toEqual({
      kind: 'deny',
      reason: 'staff_without_organization',
    });
  });

  it('reporter (any org) -> public', () => {
    expect(resolveSubjectScope('reporter', null, null)).toEqual({ kind: 'public' });
    expect(resolveSubjectScope('reporter', 'org-1', null)).toEqual({ kind: 'public' });
  });

  it('role_id IS NULL (unranked / unknown role) -> public, default branch', () => {
    expect(resolveSubjectScope(null, null, null)).toEqual({ kind: 'public' });
    expect(resolveSubjectScope('some_future_role', 'org-1', null)).toEqual({
      kind: 'public',
    });
  });
});