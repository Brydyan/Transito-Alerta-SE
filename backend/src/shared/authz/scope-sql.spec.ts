import { scopeCacheKey, scopeToSql } from './scope-sql';

describe('scopeToSql', () => {
  it('global -> TRUE, no params', () => {
    const { fragment, params } = scopeToSql({ kind: 'global' }, { table: 'incidents', paramOffset: 1 });
    expect(fragment).toBe('TRUE');
    expect(params).toEqual([]);
  });

  it('public -> TRUE, no params', () => {
    const { fragment, params } = scopeToSql({ kind: 'public' }, { table: 'incidents', paramOffset: 1 });
    expect(fragment).toBe('TRUE');
    expect(params).toEqual([]);
  });

  it('deny -> FALSE, no params', () => {
    const { fragment, params } = scopeToSql(
      { kind: 'deny', reason: 'staff_without_organization' },
      { table: 'incidents', paramOffset: 1 },
    );
    expect(fragment).toBe('FALSE');
    expect(params).toEqual([]);
  });

  it('org -> organization_id = $n, 1 param', () => {
    const { fragment, params } = scopeToSql(
      { kind: 'org', organizationId: 'org-1' },
      { table: 'incidents', paramOffset: 1 },
    );
    expect(fragment).toBe('organization_id = $1');
    expect(params).toEqual(['org-1']);
  });

  it('org respects paramOffset', () => {
    const { fragment, params } = scopeToSql(
      { kind: 'org', organizationId: 'org-1' },
      { table: 'incidents', paramOffset: 3 },
    );
    expect(fragment).toBe('organization_id = $3');
    expect(params).toEqual(['org-1']);
  });

  it('org_assigned -> organization_id = $n AND EXISTS assignments subquery, 2 params', () => {
    const { fragment, params } = scopeToSql(
      { kind: 'org_assigned', organizationId: 'org-1', userId: 'user-1' },
      { table: 'incidents', paramOffset: 1 },
    );
    expect(fragment).toBe(
      'organization_id = $1 AND EXISTS (SELECT 1 FROM assignments a WHERE a.incident_id = incidents.id AND a.operator_id = $2)',
    );
    expect(params).toEqual(['org-1', 'user-1']);
  });

  it('org_assigned uses the supplied table alias', () => {
    const { fragment } = scopeToSql(
      { kind: 'org_assigned', organizationId: 'org-1', userId: 'user-1' },
      { table: 'i', paramOffset: 1 },
    );
    expect(fragment).toContain('a.incident_id = i.id');
  });
});

describe('scopeCacheKey', () => {
  it('global -> g', () => {
    expect(scopeCacheKey({ kind: 'global' })).toBe('g');
  });
  it('public -> p', () => {
    expect(scopeCacheKey({ kind: 'public' })).toBe('p');
  });
  it('deny -> deny', () => {
    expect(scopeCacheKey({ kind: 'deny', reason: 'staff_without_organization' })).toBe('deny');
  });
  it('org -> o:{org}', () => {
    expect(scopeCacheKey({ kind: 'org', organizationId: 'org-1' })).toBe('o:org-1');
  });
  it('org_assigned -> oa:{org}:{user}', () => {
    expect(
      scopeCacheKey({ kind: 'org_assigned', organizationId: 'org-1', userId: 'user-1' }),
    ).toBe('oa:org-1:user-1');
  });
});
