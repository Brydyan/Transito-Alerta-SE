import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';

import { AuthContext } from '../../shared/authz/subject-scope';
import { sha256Hex } from '../../shared/crypto/session-hash';
import { InvitationsService } from './invitations.service';

function actor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'actor-1',
    permissions: [],
    organizationId: 'org-1',
    // 2026-10-18 — `departmentId` agregado al factory. `null` por
    // default; los tests pre-existentes usan scope 'org'. Si un test
    // necesita dept, lo pasa por `overrides`.
    departmentId: null,
    roleName: 'admin_org',
    scope: { kind: 'org', organizationId: 'org-1' },
    sessionId: 'session-actor-1',
    isAnonymous: false,
    ...overrides,
  };
}

describe('InvitationsService (T3.6 design §3.5, mocked repository)', () => {
  let invitationsRepository: {
    insertPending: jest.Mock;
    findPreviewByHash: jest.Mock;
    redeemCas: jest.Mock;
    findDiagnosisByHash: jest.Mock;
    findByClaimedEmail: jest.Mock;
    deleteIfPending: jest.Mock;
    findPendingByOrganization: jest.Mock;
  };
  let roleRepo: { findOne: jest.Mock };
  let organizationRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock; query: jest.Mock };
  let passwordHasher: { hash: jest.Mock; verify: jest.Mock };
  let mailService: { enqueue: jest.Mock };
  let configService: ConfigService;
  let service: InvitationsService;

  beforeEach(() => {
    invitationsRepository = {
      insertPending: jest.fn(),
      findPreviewByHash: jest.fn(),
      redeemCas: jest.fn(),
      findDiagnosisByHash: jest.fn(),
      findByClaimedEmail: jest.fn(),
      deleteIfPending: jest.fn(),
      findPendingByOrganization: jest.fn(),
    };
    roleRepo = { findOne: jest.fn() };
    organizationRepo = { findOne: jest.fn() };
    dataSource = { transaction: jest.fn(), query: jest.fn() };
    passwordHasher = { hash: jest.fn(), verify: jest.fn() };
    mailService = { enqueue: jest.fn() };
    configService = { get: () => ({ appBaseUrl: 'http://localhost:3000' }) } as unknown as ConfigService;

    service = new InvitationsService(
      invitationsRepository as never,
      roleRepo as never,
      organizationRepo as never,
      dataSource as unknown as DataSource,
      passwordHasher as never,
      mailService as never,
      configService,
      // 2026-10-10-user-onboarding-telegram-tour: the service now
      // mints a one-shot Telegram link token at createInvitation.
      { issueFor: jest.fn().mockResolvedValue('telegram-tok'), composeDeepLink: jest.fn().mockReturnValue('https://t.me/tase_alert_bot?start=telegram-tok') } as never,
    );
  });

  describe('createInvitation', () => {
    it('409 EMAIL_ALREADY_CLAIMED pre-check happens before any token is generated', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'operator_org' });
      organizationRepo.findOne.mockResolvedValue({ id: 'org-1', name: 'Santa Elena' });
      invitationsRepository.findByClaimedEmail.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.createInvitation(actor(), { email: 'taken@x.com', roleId: 'role-1', organizationId: 'org-1' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(invitationsRepository.insertPending).not.toHaveBeenCalled();
      expect(mailService.enqueue).not.toHaveBeenCalled();
    });

    it('404 when the role does not exist', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createInvitation(actor(), { email: 'a@b.com', roleId: 'ghost-role', organizationId: 'org-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 via assertCanInvite when the org is out of the actor scope', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'operator_org' });
      organizationRepo.findOne.mockResolvedValue({ id: 'org-2', name: 'Other Org' });

      await expect(
        service.createInvitation(
          actor({ scope: { kind: 'org', organizationId: 'org-1' } }),
          { email: 'a@b.com', roleId: 'role-1', organizationId: 'org-2' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(invitationsRepository.findByClaimedEmail).not.toHaveBeenCalled();
    });

    it('happy path: inserts the row and enqueues the invitation mail', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'operator_org' });
      organizationRepo.findOne.mockResolvedValue({ id: 'org-1', name: 'Santa Elena' });
      invitationsRepository.findByClaimedEmail.mockResolvedValue(null);
      invitationsRepository.insertPending.mockResolvedValue({
        id: 'inv-1',
        email: 'a@b.com',
        role_id: 'role-1',
        organization_id: 'org-1',
        expires_at: new Date(),
        created_at: new Date(),
      });
      // 2026-10-10-user-onboarding-telegram-tour: the service looks
      // up the user shadow to bind the link token. Stub a fake
      // shadow here.
      dataSource.query.mockResolvedValueOnce([{ id: 'shadow-1', first_name: 'María' }]);
      // 2026-10-16-invitation-email-styled-template (D2): the
      // service also looks up the inviter to fill the
      // "Invitado por" row in the details card.
      dataSource.query.mockResolvedValueOnce([{ first_name: 'Carlos', last_name: 'Mendoza' }]);

      const result = await service.createInvitation(actor(), {
        email: 'a@b.com',
        roleId: 'role-1',
        organizationId: 'org-1',
      });

      expect(result.id).toBe('inv-1');
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.com', template: 'invitation' }),
      );
      // Telegram link token + deep link + role guide are part of
      // the email payload (D6 / R3 / R6).
      const call = mailService.enqueue.mock.calls[0][0];
      expect(call.data.telegramLink).toBe(
        'https://t.me/tase_alert_bot?start=telegram-tok',
      );
      expect(call.data.roleGuide).toContain('Operador de Campo');
      expect(call.data.roleGuide).toContain('recibirás las tareas en Telegram');
      // 2026-10-16-invitation-email-styled-template (D2): subject
      // names the organization when one is provided; new data fields
      // carry inviter name, recipient first name, recipient email
      // and ISO expiresAt.
      expect(call.subject).toBe('Invitación a GeoReporta — Santa Elena');
      expect(call.data.inviterName).toBe('Carlos Mendoza');
      expect(call.data.recipientFirstName).toBe('María');
      expect(call.data.recipientEmail).toBe('a@b.com');
      expect(typeof call.data.expiresAt).toBe('string');
      expect(call.data.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

    // 2026-10-16-invitations-shadow-guard (Opción A) — el flujo
    // normal SIEMPRE llama `POST /api/users` antes que
    // `POST /api/admin/users/invite`, así que el shadow existe. Pero
    // si el caller skipea el alta y manda el invite directo, el
    // token Telegram saldría `null` y la sección de Telegram se omite
    // silenciosamente en el correo — UX rota. Esta guarda falla
    // rápido con 422 antes de generar token, mandar el correo, o
    // dejar una fila pending colgada en la tabla.
    it('throws 422 SHADOW_USER_NOT_FOUND when no shadow user exists for the email', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'role-1', name: 'operator_org' });
      organizationRepo.findOne.mockResolvedValue({ id: 'org-1', name: 'Santa Elena' });
      invitationsRepository.findByClaimedEmail.mockResolvedValue(null);
      invitationsRepository.insertPending.mockResolvedValue({
        id: 'inv-1',
        email: 'orphan@x.com',
        role_id: 'role-1',
        organization_id: 'org-1',
        expires_at: new Date(),
        created_at: new Date(),
      });
      // 2026-10-10-user-onboarding-telegram-tour: shadow SELECT. Sin
      // adminCreate previo, no hay row → `[]`. La guarda debe
      // cortocircuitar con 422 antes de que se llame `issueFor`,
      // `insertPending`, o `enqueue`.
      dataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.createInvitation(actor(), {
          email: 'orphan@x.com',
          roleId: 'role-1',
          organizationId: 'org-1',
        }),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: 'SHADOW_USER_NOT_FOUND' },
      });

      // La guarda corta ANTES de insertPending y ANTES del mail —
      // sin token pending colgado, sin correo con token Telegram null.
      expect(invitationsRepository.insertPending).not.toHaveBeenCalled();
      expect(mailService.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('previewInvitation', () => {
    it('404 INVITATION_NOT_FOUND for an unknown token', async () => {
      invitationsRepository.findPreviewByHash.mockResolvedValue(null);

      await expect(service.previewInvitation(validToken())).rejects.toMatchObject({
        status: 404,
      });
    });

    it('410 for an already-accepted token', async () => {
      invitationsRepository.findPreviewByHash.mockResolvedValue({
        email: 'a@b.com',
        role_name: 'reporter',
        organization_name: null,
        inviter_name: null,
        accepted_at: new Date(),
        expires_at: new Date(Date.now() + 100_000),
      });

      await expect(service.previewInvitation(validToken())).rejects.toMatchObject({ status: 410 });
    });

    it('410 for an expired token', async () => {
      invitationsRepository.findPreviewByHash.mockResolvedValue({
        email: 'a@b.com',
        role_name: 'reporter',
        organization_name: null,
        inviter_name: null,
        accepted_at: null,
        expires_at: new Date(Date.now() - 1000),
      });

      await expect(service.previewInvitation(validToken())).rejects.toMatchObject({ status: 410 });
    });

    it('returns org/inviter/role/expiry for a live token', async () => {
      const expires = new Date(Date.now() + 100_000);
      invitationsRepository.findPreviewByHash.mockResolvedValue({
        email: 'a@b.com',
        role_name: 'reporter',
        organization_name: 'Santa Elena',
        inviter_name: 'Admin One',
        accepted_at: null,
        expires_at: expires,
      });

      const preview = await service.previewInvitation(validToken());

      expect(preview).toEqual({
        organization_name: 'Santa Elena',
        inviter_name: 'Admin One',
        role_name: 'reporter',
        expires_at: expires,
      });
    });

    it('400 INVALID_TOKEN for a malformed token, never reaching the repository', async () => {
      await expect(service.previewInvitation('not-a-valid-token!!')).rejects.toMatchObject({
        status: 400,
      });
      expect(invitationsRepository.findPreviewByHash).not.toHaveBeenCalled();
    });
  });

  describe('redeem (D3 — CAS-first, diagnose-second)', () => {
    function withManager() {
      const manager = { query: jest.fn() };
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => unknown) => fn(manager));
      return manager;
    }

    it('404 INVITATION_NOT_FOUND when the CAS loses and no row exists at all', async () => {
      const manager = withManager();
      invitationsRepository.redeemCas.mockResolvedValue(null);
      invitationsRepository.findDiagnosisByHash.mockResolvedValue(null);

      await expect(service.redeem(validToken(), 'password12345')).rejects.toMatchObject({ status: 404 });
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('410 INVITATION_ALREADY_USED when the CAS loses and the diagnosis shows accepted_at set', async () => {
      withManager();
      invitationsRepository.redeemCas.mockResolvedValue(null);
      invitationsRepository.findDiagnosisByHash.mockResolvedValue({
        accepted_at: new Date(),
        expires_at: new Date(Date.now() + 100_000),
      });

      await expect(service.redeem(validToken(), 'password12345')).rejects.toMatchObject({ status: 410 });
    });

    it('410 INVITATION_EXPIRED when the CAS loses and the diagnosis shows expiry passed', async () => {
      withManager();
      invitationsRepository.redeemCas.mockResolvedValue(null);
      invitationsRepository.findDiagnosisByHash.mockResolvedValue({
        accepted_at: null,
        expires_at: new Date(Date.now() - 1000),
      });

      await expect(service.redeem(validToken(), 'password12345')).rejects.toMatchObject({ status: 410 });
    });

    it('happy path: CAS wins, role permissions copied onto the new user row, returns the new user id', async () => {
      const token = validToken();
      const manager = withManager();
      const tokenHash = sha256Hex(token);
      invitationsRepository.redeemCas.mockResolvedValue({
        id: 'inv-1',
        email: 'a@b.com',
        role_id: 'role-1',
        organization_id: 'org-1',
        token_hash: tokenHash,
      });
      passwordHasher.hash.mockResolvedValue('$2b$04$fakehash');
      manager.query
        .mockResolvedValueOnce([{ permissions: ['READ incidents'] }]) // role lookup
        .mockResolvedValueOnce([]) // shadow SELECT (no pre-created shadow → INSERT path)
        .mockResolvedValueOnce([{ id: 'new-user-1' }]); // INSERT ... RETURNING id

      const userId = await service.redeem(token, 'password12345');

      expect(userId).toBe('new-user-1');
      expect(passwordHasher.hash).toHaveBeenCalledWith('password12345');
    });

    it('409 EMAIL_ALREADY_CLAIMED on a unique-violation during the INSERT (tx rolls back)', async () => {
      const token = validToken();
      const manager = withManager();
      const tokenHash = sha256Hex(token);
      invitationsRepository.redeemCas.mockResolvedValue({
        id: 'inv-1',
        email: 'a@b.com',
        role_id: 'role-1',
        organization_id: 'org-1',
        token_hash: tokenHash,
      });
      passwordHasher.hash.mockResolvedValue('$2b$04$fakehash');
      manager.query
        .mockResolvedValueOnce([{ permissions: [] }]) // role lookup
        .mockResolvedValueOnce([]) // shadow SELECT (no pre-created shadow → INSERT path)
        .mockRejectedValueOnce({ code: '23505' }); // INSERT throws unique violation

      await expect(service.redeem(token, 'password12345')).rejects.toBeInstanceOf(ConflictException);
    });

    // 2026-10-16 — bug fix: shadow-user UPDATE path. `manager.query()`
    // for `UPDATE...RETURNING` returns the [rows[], affectedCount] tuple
    // (TypeORM gotcha, same as `firstUpdatedRow` in
    // `invitations.repository.ts`); `INSERT...RETURNING` returns a flat
    // array. The shadow UPDATE branch was reading `updatedRows[0].id`
    // directly without unwrapping the tuple — `updatedRows[0]` was the
    // inner rows array, and `.id` on an array is `undefined`. `redeem()`
    // then returned `undefined`, `issueSessionForNewIdentity(undefined)`
    // INSERTed `user_id = null` → 500 on the accept-invitation route.
    //
    // El mock del UPDATE devuelve explícitamente la tupla
    // `[[{ id: 'shadow-1' }], 1]` para reproducir el bug — antes del
    // fix, el test recibía `undefined` en `userId`.
    it('happy path (shadow-user): CAS wins, UPDATE activates shadow row, returns shadow id', async () => {
      const token = validToken();
      const manager = withManager();
      const tokenHash = sha256Hex(token);
      invitationsRepository.redeemCas.mockResolvedValue({
        id: 'inv-1',
        email: 'shadow@b.com',
        role_id: 'role-1',
        organization_id: 'org-1',
        token_hash: tokenHash,
      });
      passwordHasher.hash.mockResolvedValue('$2b$04$fakehash');
      manager.query
        .mockResolvedValueOnce([{ permissions: ['READ incidents'] }]) // role lookup
        .mockResolvedValueOnce([{ id: 'shadow-1' }])                   // shadow SELECT → found
        .mockResolvedValueOnce([[{ id: 'shadow-1' }], 1]);             // UPDATE...RETURNING tuple

      const userId = await service.redeem(token, 'password12345');

      expect(userId).toBe('shadow-1');
    });

    // Mismo path con `termsVersion` para cubrir el branch del UPDATE
    // que también escribe `terms_accepted_at` + `terms_version`.
    it('happy path (shadow-user + terms): CAS wins, UPDATE writes compliance fields, returns shadow id', async () => {
      const token = validToken();
      const manager = withManager();
      const tokenHash = sha256Hex(token);
      invitationsRepository.redeemCas.mockResolvedValue({
        id: 'inv-1',
        email: 'shadow@b.com',
        role_id: 'role-1',
        organization_id: 'org-1',
        token_hash: tokenHash,
      });
      passwordHasher.hash.mockResolvedValue('$2b$04$fakehash');
      manager.query
        .mockResolvedValueOnce([{ permissions: [] }])   // role lookup
        .mockResolvedValueOnce([{ id: 'shadow-2' }])     // shadow SELECT → found
        .mockResolvedValueOnce([[{ id: 'shadow-2' }], 1]); // UPDATE...RETURNING tuple (terms branch)

      const userId = await service.redeem(token, 'password12345', 'v1');

      expect(userId).toBe('shadow-2');
    });
  });

  describe('deletePending', () => {
    it('404 when the invitation is not pending (already accepted or missing)', async () => {
      invitationsRepository.deleteIfPending.mockResolvedValue(false);

      await expect(service.deletePending('inv-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolves when a pending invitation was deleted', async () => {
      invitationsRepository.deleteIfPending.mockResolvedValue(true);

      await expect(service.deletePending('inv-1')).resolves.toBeUndefined();
    });
  });
});

// A syntactically valid base64url token — real hash value does not matter
// for tests that never reach `timingSafeEqualHex` with a pre-set expectation.
function validToken(): string {
  return Buffer.alloc(32, 7).toString('base64url');
}
