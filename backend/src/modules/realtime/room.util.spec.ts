import { canJoinRoom, incidentRoom, orgRoom, resolveRoomsForEvent, userRoom, zoneRoom } from './room.util';
import { AuthContext, SubjectScope } from '../../common/authz/subject-scope';

function ctx(scope: SubjectScope, overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    permissions: [],
    organizationId: scope.kind === 'org' || scope.kind === 'org_assigned' ? scope.organizationId : null,
    roleName: null,
    scope,
    sessionId: 'session-1',
    isAnonymous: false,
    ...overrides,
  };
}

const GLOBAL: SubjectScope = { kind: 'global' };
const ORG_A: SubjectScope = { kind: 'org', organizationId: 'org-A' };
const ORG_ASSIGNED_A: SubjectScope = { kind: 'org_assigned', organizationId: 'org-A', userId: 'user-1' };
const PUBLIC: SubjectScope = { kind: 'public' };
const DENY: SubjectScope = { kind: 'deny', reason: 'staff_without_organization' };

describe('room naming (design D6)', () => {
  it('builds geo:{zone_id}, org:{org_id}, incident:{id}, user:{id} — never role-based', () => {
    expect(zoneRoom('zone-1')).toBe('geo:zone-1');
    expect(orgRoom('org-1')).toBe('org:org-1');
    expect(incidentRoom('inc-1')).toBe('incident:inc-1');
    expect(userRoom('user-1')).toBe('user:user-1');
  });
});

describe('resolveRoomsForEvent', () => {
  it('resolves zone + org + incident rooms from an incident.created-shaped payload', () => {
    const rooms = resolveRoomsForEvent({ zone_id: 'zone-1', org_id: 'org-1', id: 'inc-1' });
    expect(rooms).toEqual(['geo:zone-1', 'org:org-1', 'incident:inc-1']);
  });

  it('omits a dimension entirely when absent (e.g. geofence_matched=false -> no zone room)', () => {
    const rooms = resolveRoomsForEvent({ zone_id: null, id: 'inc-1' });
    expect(rooms).toEqual(['incident:inc-1']);
  });

  it('accepts camelCase field names too (assignment/comment payload shapes)', () => {
    const rooms = resolveRoomsForEvent({ zoneId: 'zone-2', incident_id: 'inc-2' });
    expect(rooms).toEqual(['geo:zone-2', 'incident:inc-2']);
  });

  it('returns an empty array when the payload carries no dimension keys', () => {
    expect(resolveRoomsForEvent({})).toEqual([]);
  });
});

describe('canJoinRoom (T3.2 design D11 — authorizes the SPECIFIC room, not just a global permission)', () => {
  describe('user:{id} rooms', () => {
    it('allows only self, regardless of scope', () => {
      expect(canJoinRoom(ctx(GLOBAL, { userId: 'user-1' }), 'user:user-1')).toBe(true);
      expect(canJoinRoom(ctx(GLOBAL, { userId: 'user-1' }), 'user:user-2')).toBe(false);
      expect(canJoinRoom(ctx(PUBLIC, { userId: 'user-1' }), 'user:user-1')).toBe(true);
      expect(canJoinRoom(ctx(DENY, { userId: 'user-1' }), 'user:user-1')).toBe(true);
    });
  });

  describe('org:{id} rooms', () => {
    it('global -> yes, for any org id', () => {
      expect(canJoinRoom(ctx(GLOBAL), 'org:org-A')).toBe(true);
      expect(canJoinRoom(ctx(GLOBAL), 'org:org-B')).toBe(true);
    });

    it('org -> only its own organization', () => {
      expect(canJoinRoom(ctx(ORG_A), 'org:org-A')).toBe(true);
      expect(canJoinRoom(ctx(ORG_A), 'org:org-B')).toBe(false);
    });

    it('org_assigned -> only its own organization', () => {
      expect(canJoinRoom(ctx(ORG_ASSIGNED_A), 'org:org-A')).toBe(true);
      expect(canJoinRoom(ctx(ORG_ASSIGNED_A), 'org:org-B')).toBe(false);
    });

    it('public -> no', () => {
      expect(canJoinRoom(ctx(PUBLIC), 'org:org-A')).toBe(false);
    });

    it('deny -> no', () => {
      expect(canJoinRoom(ctx(DENY), 'org:org-A')).toBe(false);
    });
  });

  describe('geo:{zoneId} rooms (ownerOrgId pre-fetched by the caller)', () => {
    it('global -> yes, regardless of owner org', () => {
      expect(canJoinRoom(ctx(GLOBAL), 'geo:zone-1', 'org-B')).toBe(true);
    });

    it('public -> yes (mirrors the unscoped incident read view)', () => {
      expect(canJoinRoom(ctx(PUBLIC), 'geo:zone-1', 'org-B')).toBe(true);
    });

    it('org -> yes only if the zone belongs to the caller\'s own org', () => {
      expect(canJoinRoom(ctx(ORG_A), 'geo:zone-1', 'org-A')).toBe(true);
      expect(canJoinRoom(ctx(ORG_A), 'geo:zone-1', 'org-B')).toBe(false);
    });

    it('org_assigned -> yes only if the zone belongs to the caller\'s own org', () => {
      expect(canJoinRoom(ctx(ORG_ASSIGNED_A), 'geo:zone-1', 'org-A')).toBe(true);
      expect(canJoinRoom(ctx(ORG_ASSIGNED_A), 'geo:zone-1', 'org-B')).toBe(false);
    });

    it('deny -> no', () => {
      expect(canJoinRoom(ctx(DENY), 'geo:zone-1', 'org-A')).toBe(false);
    });
  });

  describe('incident:{id} rooms (ownerOrgId pre-fetched by the caller)', () => {
    it('global -> yes', () => {
      expect(canJoinRoom(ctx(GLOBAL), 'incident:inc-1', 'org-B')).toBe(true);
    });

    it('public -> yes', () => {
      expect(canJoinRoom(ctx(PUBLIC), 'incident:inc-1', 'org-B')).toBe(true);
    });

    it('org -> yes only if the incident belongs to the caller\'s own org', () => {
      expect(canJoinRoom(ctx(ORG_A), 'incident:inc-1', 'org-A')).toBe(true);
      expect(canJoinRoom(ctx(ORG_A), 'incident:inc-1', 'org-B')).toBe(false);
    });

    it('org_assigned -> yes only if the incident belongs to the caller\'s own org', () => {
      expect(canJoinRoom(ctx(ORG_ASSIGNED_A), 'incident:inc-1', 'org-A')).toBe(true);
      expect(canJoinRoom(ctx(ORG_ASSIGNED_A), 'incident:inc-1', 'org-B')).toBe(false);
    });

    it('deny -> no', () => {
      expect(canJoinRoom(ctx(DENY), 'incident:inc-1', 'org-A')).toBe(false);
    });
  });

  describe('unknown namespace', () => {
    it('default-denies, regardless of scope', () => {
      expect(canJoinRoom(ctx(GLOBAL), 'made-up:xyz')).toBe(false);
    });
  });
});
