import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { OrganizationEntity } from '../../entities/organization.entity';
import { RoleEntity } from '../../entities/role.entity';
import { assertCanInvite } from '../../common/authz/assert-can-invite';
import { AuthContext } from '../../common/authz/subject-scope';
import { sha256Hex, timingSafeEqualHex } from '../../common/crypto/session-hash';
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

    await this.mailService.enqueue({
      to: input.email,
      subject: 'You have been invited to Transito Alerta SE',
      template: 'invitation',
      data: {
        link: `${this.mailConfig.appBaseUrl}/accept-invitation?token=${token}`,
        roleName: role.name,
        organizationName: organizationName ?? '',
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

      try {
        // T6.5.B: include compliance fields if termsVersion is present
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
