import { randomUUID } from 'crypto';

import { sha256Hex } from '../../src/common/crypto/session-hash';
import { AuthContext } from '../../src/common/authz/subject-scope';
import { MailService } from '../../src/modules/mail/mail.service';
import { generateToken } from '../../src/modules/auth/token-codec';
import { PasswordResetService } from '../../src/modules/auth/password-reset.service';
import { InvitationsRepository } from '../../src/modules/invitations/invitations.repository';
import { InvitationsService } from '../../src/modules/invitations/invitations.service';
import { SessionsRepository } from '../../src/modules/sessions/sessions.repository';
import { TestEnvironment } from '../support/test-environment';

async function waitUntil(check: () => boolean, timeoutMs = 15_000, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (check()) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error('waitUntil: condition never became true within the timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Invitations / sessions integration (T3.6 design D3/D6/D11, tasks
 * 8.8-8.10) — the only place these three behaviours are exercised against a
 * REAL Postgres/Redis, exactly the way `sessions-repository.e2e-spec.ts`
 * proves the T3.9 CAS rotation SQL against real concurrency. Unit tests
 * (`invitations.service.spec.ts`, `sessions.repository.spec.ts`) only mock
 * the repository/DataSource, so they prove sequential branch logic, never
 * the concurrent guarantee or the real `[rows, count]` tuple-unwrap shape.
 */
describe('Invitations + Sessions — real-infra integration (T3.6)', () => {
  let env: TestEnvironment;
  let invitationsRepository: InvitationsRepository;
  let invitationsService: InvitationsService;
  let sessionsRepository: SessionsRepository;
  let mailService: MailService;

  beforeAll(async () => {
    env = await TestEnvironment.start();
    invitationsRepository = env.app.get(InvitationsRepository);
    invitationsService = env.app.get(InvitationsService);
    sessionsRepository = env.app.get(SessionsRepository);
    mailService = env.app.get(MailService);
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
    jest.restoreAllMocks();
  });

  async function makeUser(deviceUuid = `inviter-${randomUUID()}`): Promise<string> {
    const { rows } = await env.pg.query<{ id: string }>(
      `INSERT INTO users (device_uuid, permissions, is_active) VALUES ($1, '[]'::jsonb, true) RETURNING id`,
      [deviceUuid],
    );
    return rows[0].id;
  }

  async function roleId(name: string): Promise<string> {
    const { rows } = await env.pg.query<{ id: string }>('SELECT id FROM roles WHERE name = $1', [name]);
    if (!rows[0]) {
      throw new Error(`Seed role "${name}" not found — is 0015 applied?`);
    }
    return rows[0].id;
  }

  /**
   * InvitationsService.redeem CAS race (T3.6 design D3, task 8.9) — the
   * single most safety-critical behaviour in the whole change
   * (double-account-creation / double-session-mint prevention). Calls
   * `InvitationsService.redeem` directly (not through HTTP), same pattern
   * as `sessions-repository.e2e-spec.ts`'s `repo.rotate()` race test —
   * `Promise.all` of two real concurrent transactions against one Postgres
   * row, no mocked lock anywhere.
   */
  describe('InvitationsService.redeem — CAS integration (D3, real Postgres concurrency)', () => {
    it('two concurrent redeem() calls on one token: exactly one 201-equivalent wins, exactly one users row', async () => {
      const inviterId = await makeUser();
      const role = await roleId('operador_organizacion');
      const email = `cas-race-${randomUUID()}@example.com`;
      const token = generateToken();
      const tokenHash = sha256Hex(token);

      await invitationsRepository.insertPending({
        email,
        roleId: role,
        organizationId: null,
        tokenHash,
        invitedByUserId: inviterId,
      });

      const results = await Promise.allSettled([
        invitationsService.redeem(token, 'RaceWinnerPassw0rd!'),
        invitationsService.redeem(token, 'RaceLoserPassw0rd!!'),
      ]);

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled',
      );
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const reason = rejected[0].reason as { getStatus?: () => number; getResponse?: () => unknown };
      expect(reason.getStatus?.()).toBe(410);
      expect(reason.getResponse?.()).toMatchObject({ code: 'INVITATION_ALREADY_USED' });

      const { rows: userRows } = await env.pg.query('SELECT id FROM users WHERE email = $1', [email]);
      expect(userRows).toHaveLength(1);
      expect(userRows[0].id).toBe(fulfilled[0].value);

      const { rows: invitationRows } = await env.pg.query<{ accepted_at: Date | null }>(
        'SELECT accepted_at FROM invitations WHERE token_hash = $1',
        [tokenHash],
      );
      expect(invitationRows[0].accepted_at).not.toBeNull();
    });
  });

  /**
   * SessionsRepository.revokeAllForUser (T3.6 design D6, task 8.8) — proves
   * the real `UPDATE ... RETURNING` against a multi-row result set unwraps
   * via `updatedRows` (the FULL array), not `firstUpdatedRow` (which would
   * silently drop rows 2..N) — exactly the class of bug design.md's own
   * "Learned" section warned a mocked `DataSource.query` cannot catch.
   */
  describe('SessionsRepository.revokeAllForUser — integration (D6, real Postgres)', () => {
    it('N active + 1 already-revoked + 1 expired -> revokes and returns exactly the N active rows', async () => {
      const userId = await makeUser();

      const active1 = await sessionsRepository.create({
        id: randomUUID(),
        userId,
        deviceUuid: 'device-active-1',
        refreshTokenHash: 'a'.repeat(64),
        ipAddress: null,
        userAgent: null,
        ttlSeconds: 604800,
      });
      const active2 = await sessionsRepository.create({
        id: randomUUID(),
        userId,
        deviceUuid: 'device-active-2',
        refreshTokenHash: 'b'.repeat(64),
        ipAddress: null,
        userAgent: null,
        ttlSeconds: 604800,
      });
      const alreadyRevoked = await sessionsRepository.create({
        id: randomUUID(),
        userId,
        deviceUuid: 'device-revoked',
        refreshTokenHash: 'c'.repeat(64),
        ipAddress: null,
        userAgent: null,
        ttlSeconds: 604800,
      });
      await sessionsRepository.revoke(alreadyRevoked.id);
      const expired = await sessionsRepository.create({
        id: randomUUID(),
        userId,
        deviceUuid: 'device-expired',
        refreshTokenHash: 'd'.repeat(64),
        ipAddress: null,
        userAgent: null,
        ttlSeconds: -10,
      });

      const revoked = await sessionsRepository.revokeAllForUser(userId);
      const revokedIds = revoked.map((r) => r.id).sort();
      expect(revokedIds).toEqual([active1.id, active2.id].sort());

      const { rows } = await env.pg.query<{ id: string; revoked_at: Date | null }>(
        'SELECT id, revoked_at FROM user_sessions WHERE user_id = $1',
        [userId],
      );
      const revokedAtById = Object.fromEntries(rows.map((r) => [r.id, r.revoked_at]));

      expect(revokedAtById[active1.id]).not.toBeNull();
      expect(revokedAtById[active2.id]).not.toBeNull();
      // Already-revoked and expired rows are untouched by this call — the
      // predicate (`revoked_at IS NULL AND expires_at > now()`) excludes
      // them; only their PRE-EXISTING state should differ.
      expect(revokedAtById[expired.id]).toBeNull();
    });

    it('zero active sessions -> returns an empty array, never throws', async () => {
      const userId = await makeUser();
      const revoked = await sessionsRepository.revokeAllForUser(userId);
      expect(revoked).toEqual([]);
    });
  });

  /**
   * MailService.enqueue for the invitation/password-reset templates (T3.6
   * design D11, task 8.10) — real Redis `mail:outbox`, real
   * `MailOutboxConsumer` claim+deliver loop already running inside `env.app`
   * (no mocked Redis seam). Injects HTML-breaking data (`<script>` in an
   * organization name) to prove the escaped-render guarantee holds
   * end-to-end, not just at the pure `renderMailTemplate` unit level.
   */
  describe('MailService — invitation/password-reset outbox delivery (D11, real Redis)', () => {
    it('invitation template: enqueued, delivered, and rendered with the organization name escaped', async () => {
      const deliverSpy = jest.spyOn(mailService, 'deliver');
      const inviterId = await makeUser();
      const { rows: orgRows } = await env.pg.query<{ id: string }>(
        `INSERT INTO organizations (id, name) VALUES ($1, $2) RETURNING id`,
        [randomUUID(), '<script>alert(1)</script> Org'],
      );
      const organizationId = orgRows[0].id;
      const role = await roleId('operador_organizacion');
      const email = `outbox-invite-${randomUUID()}@example.com`;

      const actor: AuthContext = {
        userId: inviterId,
        permissions: ['CREATE invitations'],
        organizationId: null,
        roleName: 'admin_sistema',
        scope: { kind: 'global' },
        sessionId: null,
        isAnonymous: false,
      };

      await invitationsService.createInvitation(actor, { email, roleId: role, organizationId });

      await waitUntil(() =>
        deliverSpy.mock.calls.some((call) => call[0] === email && call[2] === 'invitation'),
      );

      const call = deliverSpy.mock.calls.find((c) => c[0] === email && c[2] === 'invitation')!;
      const html = mailService.renderTemplate('invitation', call[3]);
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('accept-invitation?token=');
    });

    it('password-reset template: enqueued, delivered, and rendered with an escaped link, no plaintext leak', async () => {
      const deliverSpy = jest.spyOn(mailService, 'deliver');
      const email = `outbox-reset-${randomUUID()}@example.com`;
      await env.provisionPasswordUser(email, 'OriginalPassw0rd!!!');

      const passwordResetService = env.app.get(PasswordResetService);
      await passwordResetService.requestReset(email);

      await waitUntil(() =>
        deliverSpy.mock.calls.some((call) => call[0] === email && call[2] === 'password-reset'),
      );

      const call = deliverSpy.mock.calls.find((c) => c[0] === email && c[2] === 'password-reset')!;
      const html = mailService.renderTemplate('password-reset', call[3]);
      expect(html).toContain('reset-password?token=');
      expect(html).not.toMatch(/OriginalPassw0rd/);
    });
  });
});
