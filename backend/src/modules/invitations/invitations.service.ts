import { ConflictException, HttpException, HttpStatus, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { OrganizationEntity } from '../organizations/entities/organization.entity';
import { RoleEntity } from '../roles/entities/role.entity';
import { assertCanInvite } from '../../shared/authz/assert-can-invite';
import { AuthContext } from '../../shared/authz/subject-scope';
import { sha256Hex, timingSafeEqualHex } from '../../shared/crypto/session-hash';
import { decodeTokenOrThrow, generateToken } from '../auth/token-codec';
import { PasswordHasher } from '../auth/password-hasher';
import { MailService } from '../mail/mail.service';
import { MailConfig } from '../../config/mail.config';
import { ConfigService } from '@nestjs/config';
import { EMAIL_ALREADY_CLAIMED } from '../auth/auth-errors';
import {
  INVITATION_ALREADY_USED,
  INVITATION_EXPIRED,
  INVITATION_NOT_FOUND,
} from './invitation-errors';
import { InvitationsRepository } from './invitations.repository';
import { TelegramLinkService } from '../telegram/telegram-link.service';
import { getTourProfileForRole } from '../telegram/constants/tour-profiles.constants';
import { ROLE_DISPLAY_NAMES } from '../roles/role-display-names.constants';
import { PRODUCT_NAME } from '../mail/product-name';

export interface CreateInvitationInput {
  email: string;
  roleId: string;
  organizationId: string | null;
}

export interface InvitationSummary {
  id: string;
  email: string;
  role_id: string;
  organization_id: string | null;
  expires_at: Date;
  created_at: Date;
}

export interface InvitationPreview {
  organization_name: string | null;
  inviter_name: string | null;
  role_name: string;
  expires_at: Date;
}

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * InvitationsService (T3.6 design §3.5). Redemption is CAS-first,
 * diagnose-second (D3), running inside `dataSource.transaction` — the
 * `users` INSERT and the invitation CAS commit or roll back together.
 *
 * `redeem` returns only the new user's id — it deliberately does NOT call
 * `AuthService.issueSessionForNewIdentity` itself (that would require
 * `InvitationsModule` to import `AuthModule`, which already imports
 * `InvitationsModule` for this exact route — a real two-way dependency,
 * not just an import-order nuisance, since both services would need each
 * other's providers). `AuthController.acceptInvitation` — which already
 * holds both services — mints the session STRICTLY AFTER this method's
 * transaction has committed (design "Component Design": issueSession runs
 * outside the tx), keeping `InvitationsModule` a leaf with zero edge back
 * into `AuthModule`.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly invitationsRepository: InvitationsRepository,
    @InjectRepository(RoleEntity) private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly organizationRepo: Repository<OrganizationEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly passwordHasher: PasswordHasher,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    // 2026-10-10-user-onboarding-telegram-tour (D2/R3) — the
    // invitation email embeds a one-shot Telegram deep-link bound
    // to the user shadow. The user is not yet created at this
    // point (is_active=false, the real row arrives via `redeem`),
    // so the link token is bound to the shadow's id and the same
    // row remains after the invitation is accepted.
    private readonly telegramLink: TelegramLinkService,
  ) {}

  private get mailConfig(): MailConfig {
    return this.configService.get<MailConfig>('mail')!;
  }

  /**
   * `POST /admin/users/invite` (spec "Invitation Lifecycle"). 409 pre-check
   * on the claimed email happens BEFORE any token is generated — a
   * duplicate invite to an already-claimed email creates no row at all.
   */
  async createInvitation(actor: AuthContext, input: CreateInvitationInput): Promise<InvitationSummary> {
    const role = await this.roleRepo.findOne({ where: { id: input.roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${input.roleId} not found`);
    }

    if (input.organizationId) {
      const organization = await this.organizationRepo.findOne({ where: { id: input.organizationId } });
      if (!organization) {
        throw new NotFoundException(`Organization ${input.organizationId} not found`);
      }
    }

    assertCanInvite(actor, input.organizationId, role.name);

    const claimed = await this.invitationsRepository.findByClaimedEmail(input.email);
    if (claimed) {
      throw new ConflictException({
        code: EMAIL_ALREADY_CLAIMED,
        message: 'This email already has a claimed account',
      });
    }

    const token = generateToken();
    const tokenHash = sha256Hex(token);

    const row = await this.invitationsRepository.insertPending({
      email: input.email,
      roleId: input.roleId,
      organizationId: input.organizationId,
      tokenHash,
      invitedByUserId: actor.userId,
    });

    const organizationName = input.organizationId
      ? (await this.organizationRepo.findOne({ where: { id: input.organizationId } }))?.name ?? null
      : null;

    // 2026-10-10-user-onboarding-telegram-tour (D2/R3/R6) — the
    // shadow user row was created in adminCreate; we look it up
    // here so the link token maps to the same id that survives
    // `redeem`. The shadow is guaranteed to exist because
    // `findByClaimedEmail` succeeded (no claimed user) and the
    // 409 `EMAIL_ALREADY_CLAIMED` path returns earlier.
    //
    // 2026-10-16-invitation-email-styled-template (D2) — expand the
    // shadow SELECT to also project `first_name`; the rendered email
    // greets the recipient by name when one is on file (adminCreate
    // may have pre-populated the shadow). Falls back to a generic
    // greeting when the shadow has no first name (direct invite
    // without a prior adminCreate).
    const shadow = await this.dataSource.query<
      Array<{ id: string; first_name: string | null }>
    >(`SELECT id, first_name FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1`, [
      input.email,
    ]);
    const linkToken = shadow[0]
      ? await this.telegramLink.issueFor(shadow[0].id)
      : null;
    const telegramDeepLink = linkToken
      ? this.telegramLink.composeDeepLink(linkToken)
      : null;
    // The role guide text is the same body the bot will send after
    // the user links their Telegram chat — same source, no drift.
    const roleProfile = getTourProfileForRole(role.name);
    const roleGuide = roleProfile ? roleProfile.tour : null;

    // 2026-10-16-invitation-email-styled-template (D2) — look up the
    // inviter's display name for the "Invitado por" row in the
    // details card. Defensive: the actor row may be missing in
    // pathological cases (orphan actor id) — fall back to an empty
    // string so the template renders its own "El administrador"
    // generic placeholder rather than a broken reference.
    const inviterRows = await this.dataSource.query<
      Array<{ first_name: string | null; last_name: string | null }>
    >(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [actor.userId],
    );
    const inviterName = inviterRows[0]
      ? [inviterRows[0].first_name, inviterRows[0].last_name]
          .filter(Boolean)
          .join(' ')
      : '';

    await this.mailService.enqueue({
      to: input.email,
      // 2026-10-16-invitation-email-styled-template (D2) — el subject
      // ahora nombra la organización cuando hay una, para que el
      // invitado sepa desde la bandeja a qué equipo se le está
      // convocando (evita el phishing-by-mistake en bandejas mixtas).
      // El fallback es `PRODUCT_NAME` para mantener el contrato de
      // unicidad de origen (D11).
      subject: organizationName
        ? `Invitación a ${PRODUCT_NAME} — ${organizationName}`
        : `Invitación a ${PRODUCT_NAME}`,
      template: 'invitation',
      data: {
        link: `${this.mailConfig.appBaseUrl}/accept-invitation?token=${token}`,
        roleName: ROLE_DISPLAY_NAMES[role.name] ?? role.name,
        organizationName: organizationName ?? '',
        // telegramLink + roleGuide are only meaningful for staff
        // roles. `reporter` is not in this flow (D7) but the
        // template guards with `telegramLink ?` so an empty
        // section is the safe outcome if a future role slips in.
        telegramLink: telegramDeepLink ?? '',
        roleGuide: roleGuide ?? '',
        // 2026-10-16-invitation-email-styled-template (D2) — la
        // plantilla nueva usa estos campos para personalizar el
        // saludo y la tarjeta de detalles. Todos pasan por
        // `escapeHtml()` / `field()` en `mail-templates.ts` (R13).
        inviterName,
        recipientFirstName: shadow[0]?.first_name ?? '',
        recipientEmail: input.email,
        // ISO 8601 — `mail-templates.ts` lo formatea con `Intl` a
        // la zona horaria de Ecuador. Vacío sólo si la fila no
        // expone `expires_at`, lo cual no debería ocurrir en este
        // punto (la fila se acaba de insertar con TTL 48h).
        expiresAt: row.expires_at.toISOString(),
      },
    });

    return {
      id: row.id,
      email: row.email,
      role_id: row.role_id,
      organization_id: row.organization_id,
      expires_at: row.expires_at,
      created_at: row.created_at,
    };
  }

  /** `GET /invitations/preview?token=` — no auth, never consumes the token (spec). */
  async previewInvitation(token: string): Promise<InvitationPreview> {
    const decoded = decodeTokenOrThrow(token);
    const hash = sha256Hex(decoded);

    const row = await this.invitationsRepository.findPreviewByHash(hash);
    if (!row) {
      throw new NotFoundException({ code: INVITATION_NOT_FOUND, message: 'Invitation not found' });
    }
    if (row.accepted_at !== null) {
      throw this.gone(INVITATION_ALREADY_USED, 'Invitation already used');
    }
    if (row.expires_at.getTime() <= Date.now()) {
      throw this.gone(INVITATION_EXPIRED, 'Invitation expired');
    }

    return {
      organization_name: row.organization_name,
      inviter_name: row.inviter_name,
      role_name: row.role_name,
      expires_at: row.expires_at,
    };
  }

  /**
   * `POST /auth/accept-invitation {token, password, terms_version?}` (design D3). CAS-first
   * (`redeemCas`), diagnose-second on 0 rows (`findDiagnosisByHash`) — the
   * SQL predicate is the single source of "who won", never a prior read.
   * Returns the new user's id; the caller (`AuthController`) mints the
   * session AFTER this transaction commits.
   *
   * T6.5.B — if `termsVersion` is present, writes `terms_accepted_at = NOW()`
   * and `terms_version` to the user row inside the same transaction.
   */
  async redeem(token: string, password: string, termsVersion?: string): Promise<string> {
    const decoded = decodeTokenOrThrow(token);
    const hash = sha256Hex(decoded);
    const passwordHash = await this.passwordHasher.hash(password);

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const row = await this.invitationsRepository.redeemCas(hash, manager);

      if (!row) {
        const diagnosis = await this.invitationsRepository.findDiagnosisByHash(hash);
        if (!diagnosis) {
          throw new NotFoundException({ code: INVITATION_NOT_FOUND, message: 'Invitation not found' });
        }
        if (diagnosis.accepted_at !== null) {
          throw this.gone(INVITATION_ALREADY_USED, 'Invitation already used');
        }
        throw this.gone(INVITATION_EXPIRED, 'Invitation expired');
      }

      // Defense in depth (design D4) — the SQL predicate already guarantees
      // exact equality; this re-compare costs one call and never trusts the
      // DB round trip alone for the security-relevant match.
      if (!timingSafeEqualHex(hash, row.token_hash)) {
        throw new NotFoundException({ code: INVITATION_NOT_FOUND, message: 'Invitation not found' });
      }

      const roleRows: Array<{ permissions: string[] }> = await manager.query(
        `SELECT permissions FROM roles WHERE id = $1`,
        [row.role_id],
      );
      const permissions = roleRows[0]?.permissions ?? [];

      // Shadow-user check: adminCreate pre-creates a row with is_active=false.
      // If one exists, UPDATE it to activate it (preserves first_name, last_name,
      // phone, department_id, geo_zone_id set by the admin). If no shadow exists
      // (direct invitation without a prior adminCreate), INSERT a fresh row.
      const shadowRows: Array<{ id: string }> = await manager.query(
        `SELECT id FROM users WHERE email = $1 AND is_active = FALSE AND deleted_at IS NULL LIMIT 1`,
        [row.email],
      );
      const shadow = shadowRows[0] ?? null;

      try {
        if (shadow) {
          // Activate the shadow row in-place — all admin-supplied fields are kept.
          //
          // 2026-10-16 — bug fix: `UPDATE...RETURNING` via
          // `manager.query()` returns the [rows[], affectedCount]
          // TUPLE (TypeORM gotcha, same as `firstUpdatedRow()` in
          // `invitations.repository.ts`). The previous code typed
          // `updatedRows: Array<{ id: string }>` and read
          // `updatedRows[0].id` directly — `updatedRows[0]` was the
          // inner rows array, so `.id` was `undefined`, and `redeem()`
          // returned `undefined` for the whole shadow-user path.
          // `AuthController.acceptInvitation` then called
          // `issueSessionForNewIdentity(undefined)` which INSERTed
          // `user_id = null` into `user_sessions` → 500 on the route.
          //
          // The INSERT path below does NOT need unwrapping — that
          // branch returns a flat array, per the same TypeORM gotcha
          // table documented in `invitations.repository.ts`.
          const updateResult: unknown = termsVersion
            ? await manager.query(
                `UPDATE users
                    SET password_hash = $1, is_active = true,
                        terms_accepted_at = NOW(), terms_version = $2
                  WHERE id = $3
                  RETURNING id`,
                [passwordHash, termsVersion, shadow.id],
              )
            : await manager.query(
                `UPDATE users
                    SET password_hash = $1, is_active = true
                  WHERE id = $2
                  RETURNING id`,
                [passwordHash, shadow.id],
              );
          const [updateRows] = updateResult as [Array<{ id: string }>, number];
          if (!updateRows[0]?.id) {
            // No row came back even though `shadow` existed in the
            // same transaction — the row was deleted concurrently or
            // never committed. Surface as 500 so the caller knows
            // the redemption could not complete.
            throw new InternalServerErrorException(
              `Shadow activation UPDATE returned no rows for user ${shadow.id}`,
            );
          }
          return updateRows[0].id;
        }

        // No shadow — direct invitation flow (no prior adminCreate). T6.5.B:
        // include compliance fields if termsVersion is present.
        const insertedRows: Array<{ id: string }> = termsVersion
          ? await manager.query(
              `INSERT INTO users (email, password_hash, role_id, organization_id, permissions, is_active, terms_accepted_at, terms_version)
               VALUES ($1, $2, $3, $4, $5::jsonb, true, NOW(), $6)
               RETURNING id`,
              [row.email, passwordHash, row.role_id, row.organization_id, JSON.stringify(permissions), termsVersion],
            )
          : await manager.query(
              `INSERT INTO users (email, password_hash, role_id, organization_id, permissions, is_active)
               VALUES ($1, $2, $3, $4, $5::jsonb, true)
               RETURNING id`,
              [row.email, passwordHash, row.role_id, row.organization_id, JSON.stringify(permissions)],
            );
        return insertedRows[0].id;
      } catch (err: unknown) {
        if (this.isUniqueViolation(err)) {
          // Tx rolls back — accepted_at is released, the token stays usable.
          throw new ConflictException({
            code: EMAIL_ALREADY_CLAIMED,
            message: 'This email already has a claimed account',
          });
        }
        throw err;
      }
    });
  }

  async listPending(actor: AuthContext): Promise<InvitationSummary[]> {
    const organizationId = actor.scope.kind === 'org' || actor.scope.kind === 'org_assigned'
      ? actor.scope.organizationId
      : null;
    const rows = await this.invitationsRepository.findPendingByOrganization(
      actor.scope.kind === 'global' ? null : organizationId,
    );
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role_id: row.role_id,
      organization_id: row.organization_id,
      expires_at: row.expires_at,
      created_at: row.created_at,
    }));
  }

  async deletePending(id: string): Promise<void> {
    const deleted = await this.invitationsRepository.deleteIfPending(id);
    if (!deleted) {
      throw new NotFoundException(`Invitation ${id} not found or already accepted`);
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION;
  }

  /** `410 Gone` — no built-in Nest exception class for this status (precedent: `RateLimiterGuard`'s raw `HttpException`). */
  private gone(code: string, message: string): HttpException {
    return new HttpException({ code, message }, HttpStatus.GONE);
  }
}
