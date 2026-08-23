import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { UserEntity } from '../../entities/user.entity';
import { RoleEntity } from '../../entities/role.entity';
import { OrganizationEntity } from '../../entities/organization.entity';
import { AuthContext, SubjectScope } from '../../common/authz/subject-scope';
import { AuthService } from '../auth/auth.service';
import { SessionsRepository } from '../sessions/sessions.repository';
import { AvatarStorageService } from './avatar-storage.service';
import { UsersService } from './users.service';

const GLOBAL_SCOPE: SubjectScope = { kind: 'global' };
const ORG_A_SCOPE: SubjectScope = { kind: 'org', organizationId: 'org-A' };
const PUBLIC_SCOPE: SubjectScope = { kind: 'public' };

const SYSTEM_ADMIN_ACTOR: AuthContext = {
  userId: 'admin-1',
  permissions: ['READ users'],
  organizationId: null,
  roleName: 'admin_sistema',
  scope: GLOBAL_SCOPE,
  sessionId: 'sess-admin',
  isAnonymous: false,
};

const ORG_ADMIN_ACTOR: AuthContext = {
  userId: 'org-admin-1',
  permissions: ['READ users'],
  organizationId: 'org-A',
  roleName: 'admin_organizacion',
  scope: ORG_A_SCOPE,
  sessionId: 'sess-org',
  isAnonymous: false,
};

const NO_ORG_ACTOR: AuthContext = {
  userId: 'opaque-1',
  permissions: ['READ users'],
  organizationId: null,
  roleName: 'reporter',
  scope: PUBLIC_SCOPE,
  sessionId: 'sess-rep',
  isAnonymous: false,
};

/**
 * T5.4 — UsersService.getFormData. Lives in a separate spec file because
 * the main users.service.spec.ts owns the test setup (mocks for
 * avatarStorage, authService, sessionsRepository) that this method does
 * not need. We rebuild a minimal testing module here with the two
 * repositories the method actually touches.
 */
describe('UsersService.getFormData (T5.4)', () => {
  let roleRepo: { find: jest.Mock; findOne: jest.Mock };
  let orgRepo: { find: jest.Mock; findOne: jest.Mock };
  let service: UsersService;

  beforeEach(async () => {
    roleRepo = { find: jest.fn(), findOne: jest.fn() };
    orgRepo = { find: jest.fn(), findOne: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: { findOne: jest.fn() } },
        { provide: AvatarStorageService, useValue: { upload: jest.fn() } },
        { provide: getRepositoryToken(RoleEntity), useValue: roleRepo },
        { provide: getRepositoryToken(OrganizationEntity), useValue: orgRepo },
        { provide: AuthService, useValue: { invalidatePermissionCache: jest.fn() } },
        { provide: SessionsRepository, useValue: { findActiveByUser: jest.fn() } },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('system admin: returns all roles and all orgs, no exclusion filter applied', async () => {
    roleRepo.find.mockResolvedValueOnce([
      { id: 'r1', name: 'admin_sistema' },
      { id: 'r2', name: 'admin_organizacion' },
      { id: 'r3', name: 'reporter' },
    ] as never);
    orgRepo.find.mockResolvedValueOnce([
      { id: 'org-A', name: 'Org A' },
      { id: 'org-B', name: 'Org B' },
    ] as never);

    const res = await service.getFormData(SYSTEM_ADMIN_ACTOR);

    expect(res.roles).toHaveLength(3);
    expect(res.organizations).toHaveLength(2);
    // System admin's role query MUST carry an empty `where` (no exclusion).
    expect(roleRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: ['id', 'name'], where: {} }),
    );
    expect(orgRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: ['id', 'name'] }),
    );
  });

  it('org admin: system-only roles excluded, only own org returned', async () => {
    roleRepo.find.mockResolvedValueOnce([
      { id: 'r2', name: 'admin_organizacion' },
      { id: 'r3', name: 'reporter' },
    ] as never);
    orgRepo.find.mockResolvedValueOnce([{ id: 'org-A', name: 'Org A' }] as never);

    const res = await service.getFormData(ORG_ADMIN_ACTOR);

    expect(res.roles.map((r) => r.name)).toEqual(['admin_organizacion', 'reporter']);
    expect(res.organizations).toEqual([{ id: 'org-A', name: 'Org A' }]);
    // Role query MUST carry a where clause that filters by name.
    const roleArgs = roleRepo.find.mock.calls[0][0];
    expect(roleArgs.where).toBeDefined();
    expect(roleArgs.where.name).toBeDefined();
    // Org query MUST filter by the caller's organizationId.
    const orgArgs = orgRepo.find.mock.calls[0][0];
    expect(orgArgs.where).toEqual({ id: 'org-A' });
  });

  it('non-system admin with null organizationId: organizations returns []', async () => {
    roleRepo.find.mockResolvedValueOnce([{ id: 'r3', name: 'reporter' }] as never);

    const res = await service.getFormData(NO_ORG_ACTOR);

    expect(res.roles).toEqual([{ id: 'r3', name: 'reporter' }]);
    expect(res.organizations).toEqual([]);
    // When caller is non-system AND has no org, the service MUST short-circuit
    // and never touch the org repository.
    expect(orgRepo.find).not.toHaveBeenCalled();
  });

  it('requests ASC order by name on both queries', async () => {
    roleRepo.find.mockResolvedValueOnce([{ id: 'r1', name: 'reporter' }] as never);
    orgRepo.find.mockResolvedValueOnce([{ id: 'org-A', name: 'Alpha' }] as never);

    await service.getFormData(SYSTEM_ADMIN_ACTOR);

    expect(roleRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { name: 'ASC' } }),
    );
    expect(orgRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { name: 'ASC' } }),
    );
  });
});
