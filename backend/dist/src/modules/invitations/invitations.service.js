"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvitationsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const organization_entity_1 = require("../../entities/organization.entity");
const role_entity_1 = require("../../entities/role.entity");
const assert_can_invite_1 = require("../../common/authz/assert-can-invite");
const session_hash_1 = require("../../common/crypto/session-hash");
const token_codec_1 = require("../auth/token-codec");
const password_hasher_1 = require("../auth/password-hasher");
const mail_service_1 = require("../mail/mail.service");
const config_1 = require("@nestjs/config");
const auth_errors_1 = require("../auth/auth-errors");
const invitation_errors_1 = require("./invitation-errors");
const invitations_repository_1 = require("./invitations.repository");
const POSTGRES_UNIQUE_VIOLATION = '23505';
let InvitationsService = class InvitationsService {
    constructor(invitationsRepository, roleRepo, organizationRepo, dataSource, passwordHasher, mailService, configService) {
        this.invitationsRepository = invitationsRepository;
        this.roleRepo = roleRepo;
        this.organizationRepo = organizationRepo;
        this.dataSource = dataSource;
        this.passwordHasher = passwordHasher;
        this.mailService = mailService;
        this.configService = configService;
    }
    get mailConfig() {
        return this.configService.get('mail');
    }
    async createInvitation(actor, input) {
        const role = await this.roleRepo.findOne({ where: { id: input.roleId } });
        if (!role) {
            throw new common_1.NotFoundException(`Role ${input.roleId} not found`);
        }
        if (input.organizationId) {
            const organization = await this.organizationRepo.findOne({ where: { id: input.organizationId } });
            if (!organization) {
                throw new common_1.NotFoundException(`Organization ${input.organizationId} not found`);
            }
        }
        (0, assert_can_invite_1.assertCanInvite)(actor, input.organizationId, role.name);
        const claimed = await this.invitationsRepository.findByClaimedEmail(input.email);
        if (claimed) {
            throw new common_1.ConflictException({
                code: auth_errors_1.EMAIL_ALREADY_CLAIMED,
                message: 'This email already has a claimed account',
            });
        }
        const token = (0, token_codec_1.generateToken)();
        const tokenHash = (0, session_hash_1.sha256Hex)(token);
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
    async previewInvitation(token) {
        const decoded = (0, token_codec_1.decodeTokenOrThrow)(token);
        const hash = (0, session_hash_1.sha256Hex)(decoded);
        const row = await this.invitationsRepository.findPreviewByHash(hash);
        if (!row) {
            throw new common_1.NotFoundException({ code: invitation_errors_1.INVITATION_NOT_FOUND, message: 'Invitation not found' });
        }
        if (row.accepted_at !== null) {
            throw this.gone(invitation_errors_1.INVITATION_ALREADY_USED, 'Invitation already used');
        }
        if (row.expires_at.getTime() <= Date.now()) {
            throw this.gone(invitation_errors_1.INVITATION_EXPIRED, 'Invitation expired');
        }
        return {
            organization_name: row.organization_name,
            inviter_name: row.inviter_name,
            role_name: row.role_name,
            expires_at: row.expires_at,
        };
    }
    async redeem(token, password, termsVersion) {
        const decoded = (0, token_codec_1.decodeTokenOrThrow)(token);
        const hash = (0, session_hash_1.sha256Hex)(decoded);
        const passwordHash = await this.passwordHasher.hash(password);
        return this.dataSource.transaction(async (manager) => {
            const row = await this.invitationsRepository.redeemCas(hash, manager);
            if (!row) {
                const diagnosis = await this.invitationsRepository.findDiagnosisByHash(hash);
                if (!diagnosis) {
                    throw new common_1.NotFoundException({ code: invitation_errors_1.INVITATION_NOT_FOUND, message: 'Invitation not found' });
                }
                if (diagnosis.accepted_at !== null) {
                    throw this.gone(invitation_errors_1.INVITATION_ALREADY_USED, 'Invitation already used');
                }
                throw this.gone(invitation_errors_1.INVITATION_EXPIRED, 'Invitation expired');
            }
            if (!(0, session_hash_1.timingSafeEqualHex)(hash, row.token_hash)) {
                throw new common_1.NotFoundException({ code: invitation_errors_1.INVITATION_NOT_FOUND, message: 'Invitation not found' });
            }
            const roleRows = await manager.query(`SELECT permissions FROM roles WHERE id = $1`, [row.role_id]);
            const permissions = roleRows[0]?.permissions ?? [];
            try {
                const insertedRows = termsVersion
                    ? await manager.query(`INSERT INTO users (email, password_hash, role_id, organization_id, permissions, is_active, terms_accepted_at, terms_version)
               VALUES ($1, $2, $3, $4, $5::jsonb, true, NOW(), $6)
               RETURNING id`, [row.email, passwordHash, row.role_id, row.organization_id, JSON.stringify(permissions), termsVersion])
                    : await manager.query(`INSERT INTO users (email, password_hash, role_id, organization_id, permissions, is_active)
               VALUES ($1, $2, $3, $4, $5::jsonb, true)
               RETURNING id`, [row.email, passwordHash, row.role_id, row.organization_id, JSON.stringify(permissions)]);
                return insertedRows[0].id;
            }
            catch (err) {
                if (this.isUniqueViolation(err)) {
                    throw new common_1.ConflictException({
                        code: auth_errors_1.EMAIL_ALREADY_CLAIMED,
                        message: 'This email already has a claimed account',
                    });
                }
                throw err;
            }
        });
    }
    async listPending(actor) {
        const organizationId = actor.scope.kind === 'org' || actor.scope.kind === 'org_assigned'
            ? actor.scope.organizationId
            : null;
        const rows = await this.invitationsRepository.findPendingByOrganization(actor.scope.kind === 'global' ? null : organizationId);
        return rows.map((row) => ({
            id: row.id,
            email: row.email,
            role_id: row.role_id,
            organization_id: row.organization_id,
            expires_at: row.expires_at,
            created_at: row.created_at,
        }));
    }
    async deletePending(id) {
        const deleted = await this.invitationsRepository.deleteIfPending(id);
        if (!deleted) {
            throw new common_1.NotFoundException(`Invitation ${id} not found or already accepted`);
        }
    }
    isUniqueViolation(err) {
        return typeof err === 'object' && err !== null && err.code === POSTGRES_UNIQUE_VIOLATION;
    }
    gone(code, message) {
        return new common_1.HttpException({ code, message }, common_1.HttpStatus.GONE);
    }
};
exports.InvitationsService = InvitationsService;
exports.InvitationsService = InvitationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(role_entity_1.RoleEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(organization_entity_1.OrganizationEntity)),
    __param(3, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [invitations_repository_1.InvitationsRepository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        password_hasher_1.PasswordHasher,
        mail_service_1.MailService,
        config_1.ConfigService])
], InvitationsService);
//# sourceMappingURL=invitations.service.js.map