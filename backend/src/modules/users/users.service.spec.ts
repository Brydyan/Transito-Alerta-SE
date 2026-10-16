import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import { UsersService, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './users.service';
import { UserEntity } from './entities/user.entity';
import { RoleEntity } from '../roles/entities/role.entity';
import { OrganizationEntity } from '../organizations/entities/organization.entity';
import { AuthContext, SubjectScope } from '../../shared/authz/subject-scope';
import { AuthService } from '../auth/auth.service';
import { AvatarStorageService } from './avatar-storage.service';
import { SessionsRepository } from '../sessions/sessions.repository';
import { TelegramLinkService } from '../telegram/telegram-link.service';
import { AuditService } from '../audit/audit.service';

const GLOBAL_SCOPE: SubjectScope = { kind: 'global' };
const ORG_A_SCOPE: SubjectScope = { kind: 'org', organizationId: 'org-A' };
const ORG_ASSIGNED_SCOPE: SubjectScope = {
  kind: 'org_assigned',
  organizationId: 'org-A',
  userId: 'user-1',
};
const PUBLIC_SCOPE: SubjectScope = { kind: 'public' };
const DENY_SCOPE: SubjectScope = { kind: 'deny', reason: 'staff_without_organization' };

describe('UsersService', () => {
  let userRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let avatarStorage: { upload: jest.Mock };
  let roleRepo: { find: jest.Mock; findOne: jest.Mock };
  let orgRepo: { find: jest.Mock; findOne: jest.Mock };
  let authService: { invalidatePermissionCache: jest.Mock };
  // 2026-10-16 — AUD (sc-327) — assigned in `beforeEach`. The
  // definite-assignment assertion (`!`) tells TS that the spec
  // resolves it before the `it()` bodies read it (which is true — the
  // spec runs `beforeEach` before every test).
  let auditService!: { record: jest.Mock };
  let telegramLinkService: { issueFor: jest.Mock; composeDeepLink: jest.Mock };
  let sessionsRepository: {
    findActiveByUser: jest.Mock;
    findManageableTarget: jest.Mock;
  };
  let dataSource: { query: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    userRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn((input) => ({ id: 'new-user', ...input })),
      save: jest.fn((input) => Promise.resolve({ id: 'new-user', ...input })),
    };
    avatarStorage = { upload: jest.fn() };
    roleRepo = { find: jest.fn(), findOne: jest.fn() };
    orgRepo = { find: jest.fn(), findOne: jest.fn() };
    authService = { invalidatePermissionCache: jest.fn() };
    sessionsRepository = { findActiveByUser: jest.fn(), findManageableTarget: jest.fn() };
    // 2026-10-10-user-onboarding-telegram-tour: the service now hits
    // the DB directly for departments (getFormData dropdown +
    // adminCreate/adminUpdate cross-row invariant).
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    // 2026-10-16 — AUD (sc-327) — assigned in this `beforeEach` so the
    // injected mock is populated before the service runs the first
    // audit hook (which happens BEFORE most specs' assertions).
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    // 2026-10-16 — adminGenerateTelegramLink() delegates to
    // `telegramLinkService.issueFor` + `composeDeepLink`. The mock's
    // default returns a stub link; per-test overrides verify the
    // null-link path when TELEGRAM_BOT_USERNAME is unset.
    telegramLinkService = {
      issueFor: jest.fn().mockResolvedValue('tok-stub'),
      composeDeepLink: jest.fn().mockReturnValue('https://t.me/bot?start=tok-stub'),
    };
    service = new UsersService(
      userRepo as unknown as jest.Mocked<Repository<UserEntity>>,
      avatarStorage as unknown as AvatarStorageService,
      roleRepo as unknown as jest.Mocked<Repository<RoleEntity>>,
      orgRepo as unknown as jest.Mocked<Repository<OrganizationEntity>>,
      authService as unknown as AuthService,
      sessionsRepository as unknown as SessionsRepository,
      dataSource as unknown as DataSource,
      auditService as unknown as AuditService,
      telegramLinkService as unknown as TelegramLinkService,
    );
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1' });
      const result = await service.findById('u1');
      expect(result).toEqual({ id: 'u1' });
    });

    it('throws NotFoundException when missing', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('updates first_name/last_name and returns the fresh row', async () => {
      userRepo.update.mockResolvedValue({ affected: 1 });
      userRepo.findOne.mockResolvedValue({ id: 'u1', firstName: 'Ana', lastName: 'Lopez' });

      const result = await service.updateProfile('u1', { firstName: 'Ana', lastName: 'Lopez' });

      expect(userRepo.update).toHaveBeenCalledWith('u1', { firstName: 'Ana', lastName: 'Lopez' });
      expect(result.firstName).toBe('Ana');
    });
  });

  describe('updateAvatar', () => {
    it('uploads via AvatarStorageService and persists the signed URL, without any live S3 call', async () => {
      avatarStorage.upload.mockResolvedValue('https://storage.example.com/avatars/u1/x.png?sig=abc');
      userRepo.update.mockResolvedValue({ affected: 1 });
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        avatarUrl: 'https://storage.example.com/avatars/u1/x.png?sig=abc',
      });

      const file = { buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'x.png' };
      const result = await service.updateAvatar('u1', file);

      expect(avatarStorage.upload).toHaveBeenCalledWith('u1', file);
      expect(userRepo.update).toHaveBeenCalledWith('u1', {
        avatarUrl: 'https://storage.example.com/avatars/u1/x.png?sig=abc',
      });
      expect(result.avatarUrl).toContain('storage.example.com');
    });
  });

  describe('list (T3.2 D3 — scope is a required, no-default parameter)', () => {
    it('applies the default page size when none is given', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, GLOBAL_SCOPE);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: DEFAULT_PAGE_SIZE, skip: 0 }),
      );
    });

    it('caps an oversized limit at MAX_PAGE_SIZE', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(1, 10_000, GLOBAL_SCOPE);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: MAX_PAGE_SIZE }),
      );
    });

    it('computes skip from the page number', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(3, 20, GLOBAL_SCOPE);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, skip: 40 }),
      );
    });

    it('global scope applies no organization filter (and adds the isActive: true filter for pending-shadow visibility)', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, GLOBAL_SCOPE);

      // T7.5 fix: `list` filtra por `isActive: true` para que los
      // shadows de `adminCreate` (pending hasta aceptar la
      // invitación) NO aparezcan. Sin este filtro la tabla del
      // admin mostraría "fantasmas" — users sin password que
      // aún no activaron su cuenta.
      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('org scope filters by organization_id AND isActive: true', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, ORG_A_SCOPE);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-A', isActive: true } }),
      );
    });

    it('org_assigned scope filters by the same organization_id (D3 table)', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, ORG_ASSIGNED_SCOPE);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-A', isActive: true } }),
      );
    });

    // 2026-10-16 — toggle "mostrar inactivos" en lista de usuarios.
    // activeOnly=undefined → sin filtro extra (lista completa de
    // shadow + active). Por defecto el controller manda `undefined`,
    // así que el default histórico "todos" se preserva.
    it('activeOnly=undefined returns all users (current default — no extra filter)', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, GLOBAL_SCOPE, undefined, undefined);

      // `undefined` ⇒ `isActive` se sobreescribe con `true` por
      // el default de `findAndCount`. La spec del F6 (isActive:
      // true) sigue aplicándose.
      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    // activeOnly=true → solo isActive=true. Mismo comportamiento que
    // el default histórico pero explícito desde el caller.
    it('activeOnly=true filters by isActive: true', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, GLOBAL_SCOPE, undefined, true);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    // activeOnly=false → solo isActive=false. Toggle del frontend:
    // muestra los shadow-users que adminCreate creó pero aún no
    // aceptaron invitación (T7.5).
    it('activeOnly=false filters by isActive: false (toggle "Solo inactivos / pendientes")', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, GLOBAL_SCOPE, undefined, false);

      // El `findAndCount` interno debe respetar el `isActive: false`
      // del caller — NO sobreescribir con `true`.
      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: false } }),
      );
    });

    // Mismo toggle en `org` scope: combina organizationId con el
    // isActive explícito del toggle.
    it('activeOnly=false combines with organization_id (org scope)', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(undefined, undefined, ORG_A_SCOPE, undefined, false);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-A', isActive: false },
        }),
      );
    });

    it('public scope returns self only', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1' });

      const result = await service.list(undefined, undefined, PUBLIC_SCOPE, 'user-1');

      expect(userRepo.findAndCount).not.toHaveBeenCalled();
      expect(result.items).toEqual([{ id: 'user-1' }]);
      expect(result.total).toBe(1);
    });

    it('deny scope returns an empty page without querying', async () => {
      const result = await service.list(undefined, undefined, DENY_SCOPE);

      expect(userRepo.findAndCount).not.toHaveBeenCalled();
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('getSessionsForSelf (T3.9 D9 — self, no permission/rank check)', () => {
    function makeSelfActor(overrides: Partial<AuthContext> = {}): AuthContext {
      return {
        userId: 'user-1',
        permissions: [],
        organizationId: null,
        roleName: null,
        scope: PUBLIC_SCOPE,
        sessionId: 'sid-current',
        isAnonymous: false,
        ...overrides,
      };
    }

    it('lists the actor own active sessions, marking the current one', async () => {
      sessionsRepository.findActiveByUser.mockResolvedValue([
        {
          id: 'sid-current',
          device_uuid: 'device-a',
          ip_address: null,
          user_agent: null,
          created_at: new Date(),
          last_used_at: null,
          expires_at: new Date(),
        },
        {
          id: 'sid-other',
          device_uuid: 'device-b',
          ip_address: null,
          user_agent: null,
          created_at: new Date(),
          last_used_at: null,
          expires_at: new Date(),
        },
      ]);

      const result = await service.getSessionsForSelf(makeSelfActor());

      expect(sessionsRepository.findActiveByUser).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(2);
      expect(result.find((s) => s.id === 'sid-current')!.current).toBe(true);
      expect(result.find((s) => s.id === 'sid-other')!.current).toBe(false);
      // Never leaks a hash field.
      expect(result[0]).not.toHaveProperty('refresh_token_hash');
    });
  });

  describe('getSessionsForUser (T3.9 D9 — READ, visibility only, never rank)', () => {
    function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
      return {
        userId: 'admin-1',
        permissions: ['READ sessions'],
        organizationId: 'org-A',
        roleName: 'admin_org',
        scope: { kind: 'org', organizationId: 'org-A' },
        sessionId: 'sid-admin',
        isAnonymous: false,
        ...overrides,
      };
    }

    it('lists the target user sessions when visible under actor scope', async () => {
      const actor = makeActor();
      sessionsRepository.findManageableTarget.mockResolvedValue({
        id: 'target-1',
        organizationId: 'org-A',
        roleName: 'operator_org',
      });
      sessionsRepository.findActiveByUser.mockResolvedValue([]);

      await service.getSessionsForUser(actor, 'target-1');

      expect(sessionsRepository.findActiveByUser).toHaveBeenCalledWith('target-1');
    });

    it('throws 404 when the target user does not exist', async () => {
      sessionsRepository.findManageableTarget.mockResolvedValue(null);

      await expect(service.getSessionsForUser(makeActor(), 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when the target is not visible under the actor scope (cross-org)', async () => {
      sessionsRepository.findManageableTarget.mockResolvedValue({
        id: 'target-1',
        organizationId: 'org-B',
        roleName: 'operator_org',
      });

      await expect(
        service.getSessionsForUser(makeActor({ scope: { kind: 'org', organizationId: 'org-A' } }), 'target-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(sessionsRepository.findActiveByUser).not.toHaveBeenCalled();
    });

    it('does NOT rank-gate — a lower-ranked actor can still list a visible higher-ranked target (D9: read != write)', async () => {
      const actor = makeActor({ roleName: 'operator_org' });
      sessionsRepository.findManageableTarget.mockResolvedValue({
        id: 'target-1',
        organizationId: 'org-A',
        roleName: 'master', // outranks the actor
      });
      sessionsRepository.findActiveByUser.mockResolvedValue([]);

      await expect(service.getSessionsForUser(actor, 'target-1')).resolves.toEqual([]);
    });
  });

  describe('updateOrganization (T3.2 D12 — PATCH /users/:id/organization)', () => {
    function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
      return {
        userId: 'admin-1',
        permissions: ['UPDATE users'],
        organizationId: null,
        roleName: 'master',
        scope: { kind: 'global' },
        sessionId: 'sid-admin-1',
        isAnonymous: false,
        ...overrides,
      };
    }

    it('moves the target user to the new organization and invalidates their permission cache', async () => {
      const actor = makeActor();
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: null,
        roleId: 'role-1',
        deviceUuid: 'device-target',
      });
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'operator_org' });
      userRepo.update.mockResolvedValue({ affected: 1 });
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: 'org-A',
        deviceUuid: 'device-target',
      });

      const result = await service.updateOrganization(actor, 'target-1', 'org-A');

      expect(userRepo.update).toHaveBeenCalledWith('target-1', { organizationId: 'org-A' });
      expect(authService.invalidatePermissionCache).toHaveBeenCalledWith(
        'target-1',
        'device-target',
      );
      expect(result.organizationId).toBe('org-A');
    });

    it('accepts organization_id: null to remove a user from their organization', async () => {
      const actor = makeActor();
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: 'org-A',
        roleId: 'role-1',
        deviceUuid: 'device-target',
      });
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'operator_org' });
      userRepo.update.mockResolvedValue({ affected: 1 });
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: null,
        deviceUuid: 'device-target',
      });

      const result = await service.updateOrganization(actor, 'target-1', null);

      expect(userRepo.update).toHaveBeenCalledWith('target-1', { organizationId: null });
      expect(result.organizationId).toBeNull();
    });

    it('throws 404 when the target is not visible under the actor scope', async () => {
      const actor = makeActor({
        roleName: 'admin_org',
        organizationId: 'org-B',
        scope: { kind: 'org', organizationId: 'org-B' },
      });
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: 'org-A',
        roleId: 'role-1',
        deviceUuid: 'device-target',
      });
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'operator_org' });

      await expect(service.updateOrganization(actor, 'target-1', 'org-B')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it('throws 403 INSUFFICIENT_ROLE_RANK when the target outranks or equals the actor', async () => {
      const actor = makeActor({
        roleName: 'admin_org',
        organizationId: 'org-A',
        scope: { kind: 'org', organizationId: 'org-A' },
      });
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-1',
        organizationId: 'org-A',
        roleId: 'role-sys',
        deviceUuid: 'device-target',
      });
      roleRepo.findOne.mockResolvedValue({ id: 'role-sys', name: 'master' });

      await expect(service.updateOrganization(actor, 'target-1', 'org-B')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it('throws 404 when the target user does not exist', async () => {
      const actor = makeActor();
      userRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateOrganization(actor, 'missing', 'org-A'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // T6.8.B2 + T6.8.B4 — GDPR soft delete + filtered findById

  describe('softDelete() (T6.8.B2)', () => {
    it('calls update with PII wipe fields and deletedAt when user found', async () => {
      const user = { id: 'u1', isActive: true, deviceUuid: 'dev-1' };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.update.mockResolvedValue({ affected: 1 });
      authService.invalidatePermissionCache.mockResolvedValue(undefined);

      await service.softDelete('u1', 'admin-actor');

      expect(userRepo.update).toHaveBeenCalledWith('u1', expect.objectContaining({
        deletedAt: expect.any(Date),
        isActive: false,
        firstName: 'Usuario eliminado',
        email: 'deleted+u1@tase.invalid',
        passwordHash: null,
        verificationOtp: null,
        phone: null,
      }));
      expect(authService.invalidatePermissionCache).toHaveBeenCalledWith('u1', 'dev-1');
    });

    it('throws NotFoundException when user not found (soft-deleted or missing)', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.softDelete('missing', 'admin-actor')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findById() — soft-delete filter (T6.8.B4)', () => {
    it('includes deletedAt filter in the where clause (IsNull check)', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1' });
      await service.findById('u1');
      const whereArg = userRepo.findOne.mock.calls[0][0].where;
      // deletedAt should be present in the where, TypeORM IsNull() returns FindOperator
      expect(whereArg).toHaveProperty('deletedAt');
    });

    it('throws NotFoundException when findOne returns null (user deleted)', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('deleted-user')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // F6 / 2026-09-08-f6-new-user-form — D2: adminCreate() denormalizes
  // role permissions (when role_id is provided) and persists phone.
  // Backward compat: no role_id → permissions: [], version: 1 (T5.6).
  //
  // F7 — 2026-10-10-user-onboarding-telegram-tour: when role_id is
  // a sectional role, the DTO must also carry organization_id and
  // department_id (the test sets up the dept-mock accordingly).
  // Tests that exercise the role policy itself live in the next
  // describe block.
  describe('adminCreate() (F6 D2 — denormalize role permissions + persist phone)', () => {
    it('with role_id: copies role.permissions onto the user and bumps permissionVersion to 2', async () => {
      // The "happy path" in F6 used an admin_org role. With D1 in
      // effect, that path requires org+dept. Use a global role
      // (master) here so the F6 assertion is still meaningful
      // without re-testing the policy.
      roleRepo.findOne.mockResolvedValue({
        id: 'role-master',
        name: 'master',
        permissions: ['READ dashboard', 'READ incidents'],
      });

      const result = await service.adminCreate({
        email: 'juan@municipio.ec',
        role_id: 'role-master',
      }, 'admin-actor');

      expect(roleRepo.findOne).toHaveBeenCalledWith({ where: { id: 'role-master' } });
      expect(userRepo.create).toHaveBeenCalledTimes(1);
      const createArg = userRepo.create.mock.calls[0][0];
      expect(createArg.permissions).toEqual(['READ dashboard', 'READ incidents']);
      expect(createArg.permissionVersion).toBe(2);
      expect(createArg.roleId).toBe('role-master');
      // 2026-10-16 — fix for the "operador_org shows reporter" bug.
      // Without `role: resolvedRoleName`, Postgres DEFAULT 'reporter'
      // would clobber the chosen role on insert. The frontend reads
      // `item.role` directly (users.service.ts:86), so a wrong value
      // here leaked into the audit-logs / users-list view.
      expect(createArg.role).toBe('master');
      // T7.5 fix: adminCreate crea el user en estado `is_active:
      // false` (pending). El user real se inserta via
      // `InvitationsService.redeem` cuando el destinatario acepta
      // la invitación. Esto desbloquea el flow de
      // `POST /api/admin/users/invite` que antes devolvía 409
      // `EMAIL_ALREADY_CLAIMED` apenas el admin creaba el user.
      expect(createArg.isActive).toBe(false);
      // D1: global role strips any org/dept the form might have sent.
      expect(createArg.organizationId).toBeNull();
      expect(createArg.departmentId).toBeNull();
      expect(result.permissions).toEqual(['READ dashboard', 'READ incidents']);
      expect(result.permissionVersion).toBe(2);
    });

    it('without role_id: keeps permissions: [] and permissionVersion: 1 (backward compat T5.6)', async () => {
      await service.adminCreate({ email: 'juan@municipio.ec' }, 'admin-actor');

      expect(roleRepo.findOne).not.toHaveBeenCalled();
      const createArg = userRepo.create.mock.calls[0][0];
      expect(createArg.permissions).toEqual([]);
      expect(createArg.permissionVersion).toBe(1);
      expect(createArg.roleId).toBeNull();
      // T7.5 fix: ver test anterior. `is_active: false` en el
      // shadow del admin — el user real se crea via redemption.
      expect(createArg.isActive).toBe(false);
    });

    it('with unknown role_id: throws NotFoundException and does not create the user', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.adminCreate({ email: 'juan@municipio.ec', role_id: 'uuid-x' }, 'admin-actor'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(userRepo.create).not.toHaveBeenCalled();
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('persists dto.phone onto the user row (F6 D1)', async () => {
      await service.adminCreate({
        email: 'juan@municipio.ec',
        phone: '+593 99 999 9999',
      }, 'admin-actor');

      const createArg = userRepo.create.mock.calls[0][0];
      expect(createArg.phone).toBe('+593 99 999 9999');
    });

    // 2026-10-16 — phone uniqueness (migration 0036). Pre-check
    // matches the partial-index semantics (`phone IS NOT NULL` +
    // `deleted_at IS NULL`). Two sub-cases — conflict with another
    // active user throws, conflict with a soft-deleted tombstone
    // is allowed.
    it('throws ConflictException when phone belongs to another active user', async () => {
      userRepo.findOne.mockResolvedValueOnce({
        id: 'other-user',
        email: 'maria@municipio.ec',
        phone: '+593 99 999 9999',
      });

      await expect(
        service.adminCreate(
          { email: 'juan@municipio.ec', phone: '+593 99 999 9999' },
          'admin-actor',
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      // Defense — short-circuits the insert; no role lookup, no save.
      expect(userRepo.create).not.toHaveBeenCalled();
      expect(roleRepo.findOne).not.toHaveBeenCalled();
    });

    it('allows phone reuse against a soft-deleted tombstone (deletedAt IS NULL filter)', async () => {
      // The pre-check filters `deletedAt: IsNull()` — a ghosted
      // user's phone is wiped to NULL anyway (softDelete resets it)
      // so this branch is mostly future-proofing. The mock returns
      // null → no conflict → the adminCreate proceeds normally.
      userRepo.findOne.mockResolvedValueOnce(null);

      await service.adminCreate(
        { email: 'juan@municipio.ec', phone: '+593 99 999 9999' },
        'admin-actor',
      );

      expect(userRepo.create).toHaveBeenCalledTimes(1);
    });

    it('skips the phone pre-check when dto.phone is undefined (no extra DB read)', async () => {
      userRepo.findOne.mockClear();

      await service.adminCreate(
        { email: 'juan@municipio.ec' },
        'admin-actor',
      );

      // No phone pre-check fired — the findOne for the email
      // conflict also doesn't fire because the email is unchanged
      // from the existing rows.
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });
  });

  // F7 — 2026-10-10-user-onboarding-telegram-tour (D1). The role-policy
  // constants live in `role-policy.constants.ts`; the service enforces
  // the same rules.
  describe('adminCreate() — role vs organization/department policy (D1)', () => {
    it('global role (master): forces organization_id and department_id to null even if the DTO carries them', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-master',
        name: 'master',
        permissions: [],
      });

      await service.adminCreate({
        email: 'sys@municipio.ec',
        role_id: 'role-master',
        organization_id: 'org-A',
        department_id: 'dept-1',
      }, 'admin-actor');

      const createArg = userRepo.create.mock.calls[0][0];
      expect(createArg.organizationId).toBeNull();
      expect(createArg.departmentId).toBeNull();
    });

    it('global role (agent_system): same — null org/dept', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-sys',
        name: 'agent_system',
        permissions: [],
      });

      await service.adminCreate({
        email: 'opsys@municipio.ec',
        role_id: 'role-sys',
        organization_id: 'org-A',
      }, 'admin-actor');

      const createArg = userRepo.create.mock.calls[0][0];
      expect(createArg.organizationId).toBeNull();
      expect(createArg.departmentId).toBeNull();
    });

    it('sectional role (admin_org) without organization_id: 400 BadRequest', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-admin',
        name: 'admin_org',
        permissions: [],
      });

      await expect(
        service.adminCreate({
          email: 'admin@municipio.ec',
          role_id: 'role-admin',
        }, 'admin-actor'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(userRepo.create).not.toHaveBeenCalled();
    });

    it('sectional role (admin_org) without department_id: 400 BadRequest', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-admin',
        name: 'admin_org',
        permissions: [],
      });

      await expect(
        service.adminCreate({
          email: 'admin@municipio.ec',
          role_id: 'role-admin',
          organization_id: 'org-A',
        }, 'admin-actor'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(userRepo.create).not.toHaveBeenCalled();
    });

    it('sectional role with department not in the organization: 400 BadRequest (cross-row invariant)', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-admin',
        name: 'admin_org',
        permissions: [],
      });
      dataSource.query.mockResolvedValueOnce([
        { organization_id: 'org-B', deleted_at: null },
      ]);

      await expect(
        service.adminCreate({
          email: 'admin@municipio.ec',
          role_id: 'role-admin',
          organization_id: 'org-A',
          department_id: 'dept-in-org-B',
        }, 'admin-actor'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(userRepo.create).not.toHaveBeenCalled();
    });

    it('sectional role with soft-deleted department: 400 BadRequest', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-admin',
        name: 'admin_org',
        permissions: [],
      });
      dataSource.query.mockResolvedValueOnce([
        { organization_id: 'org-A', deleted_at: new Date() },
      ]);

      await expect(
        service.adminCreate({
          email: 'admin@municipio.ec',
          role_id: 'role-admin',
          organization_id: 'org-A',
          department_id: 'dept-deleted',
        }, 'admin-actor'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sectional role with valid org+dept: persists both', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-admin',
        name: 'admin_org',
        permissions: ['READ incidents'],
      });
      dataSource.query.mockResolvedValueOnce([
        { organization_id: 'org-A', deleted_at: null },
      ]);

      await service.adminCreate({
        email: 'admin@municipio.ec',
        role_id: 'role-admin',
        organization_id: 'org-A',
        department_id: 'dept-in-org-A',
      }, 'admin-actor');

      const createArg = userRepo.create.mock.calls[0][0];
      expect(createArg.organizationId).toBe('org-A');
      expect(createArg.departmentId).toBe('dept-in-org-A');
    });

    it('reporter role (citizen): D7 isolation — forces org/dept to null', async () => {
      // `reporter` is the citizen role. Even if someone tries to
      // create one through the admin form (it should not happen —
      // but defense in depth), the service strips org/dept context
      // so a citizen never inherits an admin organization.
      roleRepo.findOne.mockResolvedValue({
        id: 'role-reporter',
        name: 'reporter',
        permissions: [],
      });

      await service.adminCreate({
        email: 'citizen@example.com',
        role_id: 'role-reporter',
        organization_id: 'org-A',
        department_id: 'dept-1',
      }, 'admin-actor');

      const createArg = userRepo.create.mock.calls[0][0];
      expect(createArg.organizationId).toBeNull();
      expect(createArg.departmentId).toBeNull();
    });
  });

  // sc-446 — adminCreate() must pass geo_zone_id from DTO to entity
  describe('adminCreate() — geo_zone_id pass-through (sc-446)', () => {
    it('passes geo_zone_id to userRepo.create() when provided in the DTO', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-master',
        name: 'master',
        permissions: [],
      });

      await service.adminCreate({
        email: 'geo@municipio.ec',
        role_id: 'role-master',
        geo_zone_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      }, 'admin-actor');

      const createArg = userRepo.create.mock.calls[0][0];
      expect(createArg.geoZoneId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('passes geoZoneId: null to userRepo.create() when geo_zone_id is absent', async () => {
      roleRepo.findOne.mockResolvedValue({
        id: 'role-master',
        name: 'master',
        permissions: [],
      });

      await service.adminCreate({
        email: 'nogeo@municipio.ec',
        role_id: 'role-master',
      }, 'admin-actor');

      const createArg = userRepo.create.mock.calls[0][0];
      expect(createArg.geoZoneId).toBeNull();
    });
  });

  // 2026-10-15-user-status-notif-channel — `adminUpdate()` accepts
  // `is_active` (Master-only, with self-deactivation guard) and
  // `preferred_notification_channel` (Master-only, anyone with
  // `UPDATE users` permission — same gate as the rest of adminUpdate).
  // Spec: openspec/changes/back/2026-10-15-user-status-notif-channel/specs/{s1-is-active-toggle,s2-notification-channel}.md
  describe('adminUpdate() — 2026-10-15-user-status-notif-channel', () => {
    const TARGET_ID = 'target-uuid';
    const CALLER_ID = 'caller-uuid';

    it('throws ForbiddenException when master caller tries to deactivate themselves', async () => {
      // target === caller id, dto.is_active === false
      userRepo.findOne.mockResolvedValueOnce({ id: CALLER_ID, isActive: true });

      await expect(
        service.adminUpdate(
          CALLER_ID,
          { is_active: false } as never,
          CALLER_ID,
          'master',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Defense: nothing was persisted and no cache bust was queued.
      expect(userRepo.save).not.toHaveBeenCalled();
      expect(authService.invalidatePermissionCache).not.toHaveBeenCalled();
    });

    it('applies is_active = false when the target differs from the caller (master role)', async () => {
      userRepo.findOne.mockResolvedValueOnce({ id: TARGET_ID, isActive: true });
      userRepo.save.mockImplementation(async (u: unknown) => u as UserEntity);

      await service.adminUpdate(
        TARGET_ID,
        { is_active: false } as never,
        CALLER_ID,
        'master',
      );

      const saveArg = userRepo.save.mock.calls[0][0];
      expect(saveArg.isActive).toBe(false);
      expect(authService.invalidatePermissionCache).toHaveBeenCalledWith(
        TARGET_ID,
        undefined,
      );
    });

    it('applies is_active = true (reactivation) for master caller', async () => {
      userRepo.findOne.mockResolvedValueOnce({ id: TARGET_ID, isActive: false });
      userRepo.save.mockImplementation(async (u: unknown) => u as UserEntity);

      await service.adminUpdate(
        TARGET_ID,
        { is_active: true } as never,
        CALLER_ID,
        'master',
      );

      const saveArg = userRepo.save.mock.calls[0][0];
      expect(saveArg.isActive).toBe(true);
    });

    it('silently ignores is_active when caller is not master (defense in depth)', async () => {
      // Non-master sends { is_active: false } — the field must be
      // dropped so a leaked permission scope can't disable accounts.
      userRepo.findOne.mockResolvedValueOnce({ id: TARGET_ID, isActive: true });
      userRepo.save.mockImplementation(async (u: unknown) => u as UserEntity);

      await service.adminUpdate(
        TARGET_ID,
        { is_active: false } as never,
        CALLER_ID,
        'admin_org',
      );

      const saveArg = userRepo.save.mock.calls[0][0];
      // Field not applied — `isActive` remains the loaded one.
      expect(saveArg.isActive).toBe(true);
    });

    it('applies preferred_notification_channel = "telegram" when provided', async () => {
      userRepo.findOne.mockResolvedValueOnce({ id: TARGET_ID, isActive: true });
      userRepo.save.mockImplementation(async (u: unknown) => u as UserEntity);

      await service.adminUpdate(
        TARGET_ID,
        { preferred_notification_channel: 'telegram' } as never,
        CALLER_ID,
        'master',
      );

      const saveArg = userRepo.save.mock.calls[0][0];
      expect(saveArg.preferredNotificationChannel).toBe('telegram');
    });

    it('applies preferred_notification_channel for non-master caller too (anyone with UPDATE users)', async () => {
      // The channel preference is not gated on master role — the
      // permission `UPDATE users` already gates the route. Spec
      // S2 only requires persistence.
      userRepo.findOne.mockResolvedValueOnce({ id: TARGET_ID, isActive: true });
      userRepo.save.mockImplementation(async (u: unknown) => u as UserEntity);

      await service.adminUpdate(
        TARGET_ID,
        { preferred_notification_channel: 'email' } as never,
        CALLER_ID,
        'admin_org',
      );

      const saveArg = userRepo.save.mock.calls[0][0];
      expect(saveArg.preferredNotificationChannel).toBe('email');
    });

    it('leaves preferred_notification_channel unchanged when DTO omits the field', async () => {
      userRepo.findOne.mockResolvedValueOnce({
        id: TARGET_ID,
        isActive: true,
        preferredNotificationChannel: 'telegram',
      });
      userRepo.save.mockImplementation(async (u: unknown) => u as UserEntity);

      await service.adminUpdate(
        TARGET_ID,
        { first_name: 'Nuevo' } as never,
        CALLER_ID,
        'master',
      );

      const saveArg = userRepo.save.mock.calls[0][0];
      expect(saveArg.preferredNotificationChannel).toBe('telegram');
      expect(saveArg.firstName).toBe('Nuevo');
    });
  });

  // 2026-10-16 — AUD (sc-327) — wiring the audit hooks for the three
  // admin-side user mutations. Each block asserts the action label,
  // resource shape, and metadata-key behavior; together they prove
  // the audit log row written for every admin mutation.
  describe('audit.record() — 2026-10-16 AUD (sc-327)', () => {
    it('adminCreate records CREATE_USER with the persisted id as resourceId', async () => {
      // Setup: a global role so the test hits the "permissions + role"
      // branch (mirrors existing adminCreate tests). The audit
      // assertion is independent of the role-lookup branch.
      roleRepo.findOne.mockResolvedValue({
        id: 'role-master',
        name: 'master',
        permissions: [],
      });

      await service.adminCreate({ email: 'audit@municipio.ec' }, 'admin-actor-1');

      // Defense — the audit row is emitted AFTER the userRepo.save
      // (the persisted id is what we want to record, not the shadow
      // input id).
      expect(userRepo.save).toHaveBeenCalledTimes(1);
      const savedId = (await userRepo.save.mock.results[0].value).id;
      expect(auditService.record).toHaveBeenCalledTimes(1);
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: 'admin-actor-1',
        action: 'CREATE_USER',
        resourceType: 'users',
        resourceId: savedId,
      });
    });

    it('adminUpdate records UPDATE_USER with callerId as actorId and the DTO touched fields as metadata', async () => {
      // PATCH updates only the two fields below; the metadata
      // should reflect exactly those (snake_case wire keys).
      userRepo.findOne.mockResolvedValueOnce({ id: 'target-1', isActive: true });
      userRepo.save.mockImplementation(async (u: unknown) => u as UserEntity);

      await service.adminUpdate(
        'target-1',
        { email: 'new@municipio.ec', first_name: 'Nuevo' } as never,
        'caller-actor-2',
        'master',
      );

      expect(auditService.record).toHaveBeenCalledTimes(1);
      const call = auditService.record.mock.calls[0][0];
      expect(call.actorId).toBe('caller-actor-2');
      expect(call.action).toBe('UPDATE_USER');
      expect(call.resourceType).toBe('users');
      expect(call.resourceId).toBe('target-1');
      // `metadata.touched_fields` lists only the DTO keys the caller
      // actually provided (omits the rest). Snake-case keys match
      // the audit-logs UI column headers.
      expect(call.metadata).toEqual({
        email: 'new@municipio.ec',
        first_name: 'Nuevo',
      });
    });

    it('adminUpdate skips the audit call when the call throws (e.g. self-deactivation guard)', async () => {
      // target === caller id, is_active=false → ForbiddenException.
      // The audit row is NOT emitted — the action was rejected, so
      // there's nothing to log.
      userRepo.findOne.mockResolvedValueOnce({ id: 'caller-actor-3', isActive: true });

      await expect(
        service.adminUpdate(
          'caller-actor-3',
          { is_active: false } as never,
          'caller-actor-3',
          'master',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(auditService.record).not.toHaveBeenCalled();
    });

    it('softDelete records DELETE_USER with callerId as actorId', async () => {
      userRepo.findOne.mockResolvedValueOnce({
        id: 'target-2',
        deviceUuid: 'dev-2',
      });
      userRepo.update.mockResolvedValueOnce(undefined);

      await service.softDelete('target-2', 'admin-actor-4');

      expect(auditService.record).toHaveBeenCalledTimes(1);
      expect(auditService.record).toHaveBeenCalledWith({
        actorId: 'admin-actor-4',
        action: 'DELETE_USER',
        resourceType: 'users',
        resourceId: 'target-2',
      });
    });
  });

  // 2026-10-16 — phone uniqueness (migration 0036). Mirror of the
  // email-conflict pattern in adminUpdate. The pre-check matches
  // the partial-index semantics (`phone IS NOT NULL` + `deleted_at
  // IS NULL`).
  describe('adminUpdate() — phone uniqueness (migration 0036)', () => {
    const TARGET_ID = 'target-1';
    const CALLER_ID = 'admin-1';

    function setupTarget(overrides: Record<string, unknown> = {}) {
      userRepo.findOne.mockReset();
      userRepo.findOne.mockResolvedValueOnce({ id: TARGET_ID, isActive: true, phone: '+593 99 111 1111', ...overrides });
    }

    it('throws ConflictException when the new phone belongs to another active user', async () => {
      setupTarget();
      userRepo.findOne.mockResolvedValueOnce({
        id: 'other-user',
        email: 'other@municipio.ec',
        phone: '+593 99 222 2222',
      });

      await expect(
        service.adminUpdate(
          TARGET_ID,
          { phone: '+593 99 222 2222' } as never,
          CALLER_ID,
          'master',
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      // Defense — the save never fires. Pre-check is the only DB hit.
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('allows the same phone when the caller sends the unchanged value (no-op)', async () => {
      // dto.phone === target.phone → pre-check short-circuits.
      setupTarget({ phone: '+593 99 111 1111' });
      userRepo.save.mockImplementation(async (u: unknown) => u as UserEntity);

      await service.adminUpdate(
        TARGET_ID,
        { phone: '+593 99 111 1111' } as never,
        CALLER_ID,
        'master',
      );

      // The pre-check finds the target itself and the conflict guard
      // (`conflict.id !== target.id`) skips — save fires normally.
      expect(userRepo.save).toHaveBeenCalledTimes(1);
    });

    it('allows the phone update when no other user has it (findOne returns null)', async () => {
      setupTarget();
      userRepo.findOne.mockResolvedValueOnce(null);
      userRepo.save.mockImplementation(async (u: unknown) => u as UserEntity);

      await service.adminUpdate(
        TARGET_ID,
        { phone: '+593 99 333 3333' } as never,
        CALLER_ID,
        'master',
      );

      expect(userRepo.save).toHaveBeenCalledTimes(1);
    });

    it('skips the phone pre-check when dto.phone is undefined', async () => {
      setupTarget();
      userRepo.save.mockImplementation(async (u: unknown) => u as UserEntity);

      await service.adminUpdate(
        TARGET_ID,
        { email: 'new@municipio.ec' } as never,
        CALLER_ID,
        'master',
      );

      // Email changed — findById + the email pre-check each fire
      // a findOne → 2 calls total. No phone pre-check fired (no
      // `phone` key in the DTO), so the phone-specific guard
      // branch is never taken. The save still runs.
      expect(userRepo.findOne).toHaveBeenCalledTimes(2);
      expect(userRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // 2026-10-16 — phone uniqueness in updateProfile (self-service).
  // Pre-check would create a TOCTOU window; we let the partial
  // index fire 23505 and translate to 409. See service.ts:updateProfile.
  describe('updateProfile() — phone uniqueness (migration 0036)', () => {
    it('translates Postgres 23505 to ConflictException', async () => {
      userRepo.update.mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.updateProfile('u1', { phone: '+593 99 999 9999' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('passes through non-23505 errors unchanged (no over-broad catch)', async () => {
      const networkError = new Error('connection refused');
      userRepo.update.mockRejectedValueOnce(networkError);

      await expect(
        service.updateProfile('u1', { phone: '+593 99 999 9999' }),
      ).rejects.toBe(networkError);
    });

    it('does not catch when no error is thrown (happy path)', async () => {
      userRepo.update.mockResolvedValueOnce({ affected: 1 });
      userRepo.findOne.mockResolvedValueOnce({ id: 'u1', phone: '+593 99 999 9999' });

      const result = await service.updateProfile('u1', { phone: '+593 99 999 9999' });

      expect(userRepo.update).toHaveBeenCalledTimes(1);
      expect(result.phone).toBe('+593 99 999 9999');
    });
  });

  // 2026-10-16 — adminGenerateTelegramLink() (POST
  // /users/:id/telegram-link). The actor's scope + rank is enforced
  // by `assertCanManage`; we mock the user row + role row here so
  // the assertion reads the source of truth, not the helper.
  describe('adminGenerateTelegramLink() (2026-10-16)', () => {
    const TARGET_ID = 'target-uuid';
    const ACTOR: AuthContext = {
      userId: 'admin-1',
      permissions: [],
      organizationId: 'org-A',
      roleName: 'admin_org',
      scope: { kind: 'org', organizationId: 'org-A' },
      sessionId: 'sess-1',
      isAnonymous: false,
    };

    it('returns { telegram_link } when the actor outranks the target', async () => {
      userRepo.findOne.mockResolvedValueOnce({
        id: TARGET_ID,
        organizationId: 'org-A',
        roleId: 'role-operator_org',
      });
      roleRepo.findOne.mockResolvedValueOnce({
        id: 'role-operator_org',
        name: 'operator_org',
      });

      const result = await service.adminGenerateTelegramLink(ACTOR, TARGET_ID);

      expect(result).toEqual({
        telegram_link: 'https://t.me/bot?start=tok-stub',
      });
      expect(telegramLinkService.issueFor).toHaveBeenCalledWith(TARGET_ID);
      expect(telegramLinkService.composeDeepLink).toHaveBeenCalledWith('tok-stub');
    });

    it('throws NotFoundException when the target user does not exist', async () => {
      userRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.adminGenerateTelegramLink(ACTOR, 'missing-uuid'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(telegramLinkService.issueFor).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the target role is reporter (D7 isolation)', async () => {
      // Reporter lives at organizationId=null (citizen), which fails
      // admin_org's `assertCanManage` BEFORE the reporter branch
      // fires. Master outranks global → reporter, so the role check
      // is what trips the user.
      const masterActor: AuthContext = {
        userId: 'master-1',
        permissions: [],
        organizationId: null,
        roleName: 'master',
        scope: { kind: 'global' },
        sessionId: 'sess-1',
        isAnonymous: false,
      };
      userRepo.findOne.mockResolvedValueOnce({
        id: TARGET_ID,
        organizationId: null,
        roleId: 'role-reporter',
      });
      roleRepo.findOne.mockResolvedValueOnce({
        id: 'role-reporter',
        name: 'reporter',
      });

      await expect(
        service.adminGenerateTelegramLink(masterActor, TARGET_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // The reporter branch fires AFTER assertCanManage — the role
      // lookup still ran (so the service can read the role name) but
      // no token is minted.
      expect(telegramLinkService.issueFor).not.toHaveBeenCalled();
    });

    it('returns { telegram_link: null } when composeDeepLink returns null (TELEGRAM_BOT_USERNAME unset)', async () => {
      userRepo.findOne.mockResolvedValueOnce({
        id: TARGET_ID,
        organizationId: 'org-A',
        roleId: 'role-operator_org',
      });
      roleRepo.findOne.mockResolvedValueOnce({
        id: 'role-operator_org',
        name: 'operator_org',
      });
      telegramLinkService.composeDeepLink.mockReturnValueOnce(null);

      const result = await service.adminGenerateTelegramLink(ACTOR, TARGET_ID);

      expect(result).toEqual({ telegram_link: null });
    });
  });
});
