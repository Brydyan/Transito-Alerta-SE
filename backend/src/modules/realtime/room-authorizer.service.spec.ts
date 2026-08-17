import type { DataSource } from 'typeorm';

import { AuthContext } from '../../common/authz/subject-scope';
import { RoomAuthorizer } from './room-authorizer.service';

function ctx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    permissions: [],
    organizationId: 'org-A',
    roleName: 'admin_organizacion',
    scope: { kind: 'org', organizationId: 'org-A' },
    ...overrides,
  };
}

describe('RoomAuthorizer (T3.2 design D11 — async owner-org lookup + pure canJoinRoom)', () => {
  let dataSource: { query: jest.Mock };
  let authorizer: RoomAuthorizer;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    authorizer = new RoomAuthorizer(dataSource as unknown as DataSource);
  });

  it('authorizes user:{id} without any DB lookup', async () => {
    const result = await authorizer.authorize(ctx({ userId: 'user-1' }), 'user:user-1');
    expect(result).toBe(true);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('authorizes org:{id} without any DB lookup', async () => {
    const result = await authorizer.authorize(ctx(), 'org:org-A');
    expect(result).toBe(true);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('looks up the owning organization_id for geo:{zoneId} via an indexed PK lookup', async () => {
    dataSource.query.mockResolvedValue([{ id: 'org-A' }]);

    const result = await authorizer.authorize(ctx(), 'geo:zone-1');

    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('organizations'), [
      'zone-1',
    ]);
    expect(result).toBe(true);
  });

  it('denies geo:{zoneId} when the zone belongs to a different org', async () => {
    dataSource.query.mockResolvedValue([{ id: 'org-B' }]);

    const result = await authorizer.authorize(ctx(), 'geo:zone-1');

    expect(result).toBe(false);
  });

  it('looks up the owning organization_id for incident:{id} via an indexed PK lookup', async () => {
    dataSource.query.mockResolvedValue([{ organization_id: 'org-A' }]);

    const result = await authorizer.authorize(ctx(), 'incident:inc-1');

    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('incidents'), [
      'inc-1',
    ]);
    expect(result).toBe(true);
  });

  it('denies incident:{id} when the incident belongs to a different org', async () => {
    dataSource.query.mockResolvedValue([{ organization_id: 'org-B' }]);

    const result = await authorizer.authorize(ctx(), 'incident:inc-1');

    expect(result).toBe(false);
  });

  it('treats a missing zone/incident row as ownerOrgId=null (falls through to canJoinRoom)', async () => {
    dataSource.query.mockResolvedValue([]);

    const globalCtx = ctx({ scope: { kind: 'global' } });
    const result = await authorizer.authorize(globalCtx, 'incident:ghost');

    expect(result).toBe(true); // global always yes, even for a null owner
  });
});
