import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOperator } from 'typeorm';

import { UserEntity } from './entities/user.entity';
import { RoleEntity } from '../roles/entities/role.entity';
import { OrganizationEntity } from '../organizations/entities/organization.entity';
import { AuthContext, SubjectScope } from '../../shared/authz/subject-scope';
import { AuthService } from '../auth/auth.service';
import { SessionsRepository } from '../sessions/sessions.repository';
import { AvatarStorageService } from './avatar-storage.service';
import { UsersService } from './users.service';
import { AuditService } from '../audit/audit.service';
import { TelegramLinkService } from '../telegram/telegram-link.service';

const GLOBAL_SCOPE: SubjectScope = { kind: 'global' };
const ORG_A_SCOPE: SubjectScope = { kind: 'org', organizationId: 'org-A' };
const PUBLIC_SCOPE: SubjectScope = { kind: 'public' };

const SYSTEM_ADMIN_ACTOR: AuthContext = {
  userId: 'admin-1',
  permissions: ['READ users'],
  organizationId: null,
  roleName: 'master',
  scope: GLOBAL_SCOPE,
  sessionId: 'sess-admin',
  isAnonymous: false,
};

const ORG_ADMIN_ACTOR: AuthContext = {
  userId: 'org-admin-1',
  permissions: ['READ users'],
  organizationId: 'org-A',
  roleName: 'admin_org',
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
  let dataSource: { query: jest.Mock };
  let service: UsersService;

  beforeEach(async () => {
    roleRepo = { find: jest.fn(), findOne: jest.fn() };
    orgRepo = { find: jest.fn(), findOne: jest.fn() };
    // F7 — departments are read via DataSource.query (D6).
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: { findOne: jest.fn() } },
        { provide: AvatarStorageService, useValue: { upload: jest.fn() } },
        { provide: getRepositoryToken(RoleEntity), useValue: roleRepo },
        { provide: getRepositoryToken(OrganizationEntity), useValue: orgRepo },
        { provide: AuthService, useValue: { invalidatePermissionCache: jest.fn() } },
        { provide: SessionsRepository, useValue: { findActiveByUser: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
        // 2026-10-16 — AUD (sc-327) — `UsersService` now takes
        // `AuditService` as the 8th constructor param. `getFormData`
        // does not call `audit.record()`, so the mock's default
        // `undefined` return is enough.
        { provide: AuditService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
        // 2026-10-16 — `adminGenerateTelegramLink()` injects
        // `TelegramLinkService`. `getFormData` does not touch it.
        { provide: TelegramLinkService, useValue: { issueFor: jest.fn(), composeDeepLink: jest.fn() } },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('system admin: returns all roles and all orgs, no exclusion filter applied', async () => {
    roleRepo.find.mockResolvedValueOnce([
      { id: 'r1', name: 'master' },
      { id: 'r2', name: 'admin_org' },
      { id: 'r3', name: 'reporter' },
    ] as never);
    orgRepo.find.mockResolvedValueOnce([
      { id: 'org-A', name: 'Org A' },
      { id: 'org-B', name: 'Org B' },
    ] as never);

    const res = await service.getFormData(SYSTEM_ADMIN_ACTOR);

    expect(res.roles).toHaveLength(3);
    expect(res.organizations).toHaveLength(2);
    // sc-340: a system admin's role query carries NO name exclusion — but it
    // DOES carry the soft-delete filter. This assertion used to require
    // `where: {}`, which locked the sc-340 defect in place: the dropdown
    // offered soft-deleted roles that the roles listing hid. An empty `where`
    // is no longer the correct criterion for "no exclusion".
    expect(roleRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: ['id', 'name'] }),
    );
    const roleArgs = roleRepo.find.mock.calls[0][0];
    expect(roleArgs.where).not.toHaveProperty('name');
    expect(roleArgs.where.deletedAt).toBeInstanceOf(FindOperator);
    expect(roleArgs.where.deletedAt.type).toBe('isNull');
    expect(orgRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: ['id', 'name'] }),
    );
  });

  it('org admin: system-only roles excluded, only own org returned', async () => {
    roleRepo.find.mockResolvedValueOnce([
      { id: 'r2', name: 'admin_org' },
      { id: 'r3', name: 'reporter' },
    ] as never);
    orgRepo.find.mockResolvedValueOnce([{ id: 'org-A', name: 'Org A' }] as never);

    const res = await service.getFormData(ORG_ADMIN_ACTOR);

    expect(res.roles.map((r) => r.name)).toEqual(['admin_org', 'reporter']);
    expect(res.organizations).toEqual([{ id: 'org-A', name: 'Org A', zone_id: null }]);
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

  /**
   * sc-340 (R1) — soft-deleted roles must never reach the form dropdown.
   *
   * `RolesService.findAll` has always filtered `deletedAt: IsNull()`; this
   * method did not, so the dropdown offered roles that the roles listing
   * hides. `0029_dynamic_menus_data_migration.sql` soft-deleted the pre-0023 legacy
   * names locally, which is what made the divergence visible.
   *
   * Asserting `toBeDefined()` here would pass on any object, so the operator
   * is checked by type as well: a soft-delete filter is `isNull`, nothing else.
   */
  it('sc-340: role query filters soft-deleted roles for a system admin', async () => {
    roleRepo.find.mockResolvedValueOnce([{ id: 'r1', name: 'master' }] as never);
    orgRepo.find.mockResolvedValueOnce([] as never);

    await service.getFormData(SYSTEM_ADMIN_ACTOR);

    const roleArgs = roleRepo.find.mock.calls[0][0];
    expect(roleArgs.where.deletedAt).toBeInstanceOf(FindOperator);
    expect(roleArgs.where.deletedAt.type).toBe('isNull');
  });

  it('sc-340: role query filters soft-deleted roles AND system-only names for a non-system admin', async () => {
    roleRepo.find.mockResolvedValueOnce([{ id: 'r3', name: 'reporter' }] as never);
    orgRepo.find.mockResolvedValueOnce([{ id: 'org-A', name: 'Org A' }] as never);

    await service.getFormData(ORG_ADMIN_ACTOR);

    const roleArgs = roleRepo.find.mock.calls[0][0];
    // The name exclusion survives...
    expect(roleArgs.where.name).toBeDefined();
    // ...and the soft-delete filter is composed alongside it, not replaced by it.
    expect(roleArgs.where.deletedAt).toBeInstanceOf(FindOperator);
    expect(roleArgs.where.deletedAt.type).toBe('isNull');
  });

  it('D6: system admin getFormData returns all departments from dataSource.query', async () => {
    roleRepo.find.mockResolvedValueOnce([{ id: 'r1', name: 'master' }] as never);
    orgRepo.find.mockResolvedValueOnce([{ id: 'org-A', name: 'Org A' }] as never);
    dataSource.query.mockResolvedValueOnce([
      { id: 'd1', name: 'Dept Alpha', organization_id: 'org-A' },
      { id: 'd2', name: 'Dept Beta', organization_id: 'org-B' },
    ]);

    const res = await service.getFormData(SYSTEM_ADMIN_ACTOR);

    expect(res.departments).toEqual([
      { id: 'd1', name: 'Dept Alpha', organization_id: 'org-A' },
      { id: 'd2', name: 'Dept Beta', organization_id: 'org-B' },
    ]);
  });

  it('D6: org-scoped user getFormData returns only own org departments', async () => {
    roleRepo.find.mockResolvedValueOnce([{ id: 'r2', name: 'admin_org' }] as never);
    orgRepo.find.mockResolvedValueOnce([{ id: 'org-A', name: 'Org A' }] as never);
    dataSource.query.mockResolvedValueOnce([
      { id: 'd1', name: 'Dept Alpha', organization_id: 'org-A' },
    ]);

    const res = await service.getFormData(ORG_ADMIN_ACTOR);

    expect(res.departments).toEqual([
      { id: 'd1', name: 'Dept Alpha', organization_id: 'org-A' },
    ]);
    // The SQL query must pass the org filter as a parameter
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('organization_id = $1'),
      ['org-A'],
    );
  });

  it('D6: user with no org gets empty departments[]', async () => {
    roleRepo.find.mockResolvedValueOnce([{ id: 'r3', name: 'reporter' }] as never);

    const res = await service.getFormData(NO_ORG_ACTOR);

    expect(res.departments).toEqual([]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
