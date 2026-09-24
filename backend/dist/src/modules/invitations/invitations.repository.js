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
exports.InvitationsRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const INVITATION_ROW_COLUMNS = `id, email, role_id, organization_id, token_hash,
       accepted_at, expires_at, invited_by_user_id, created_at`;
let InvitationsRepository = class InvitationsRepository {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async insertPending(input) {
        const rows = await this.dataSource.query(`INSERT INTO invitations (email, role_id, organization_id, token_hash, invited_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${INVITATION_ROW_COLUMNS}`, [input.email, input.roleId, input.organizationId, input.tokenHash, input.invitedByUserId]);
        return rows[0];
    }
    async findPreviewByHash(tokenHash) {
        const rows = await this.dataSource.query(`SELECT i.email, r.name AS role_name, o.name AS organization_name,
              (u.first_name || ' ' || u.last_name) AS inviter_name,
              i.accepted_at, i.expires_at
         FROM invitations i
         JOIN roles r ON r.id = i.role_id
         LEFT JOIN organizations o ON o.id = i.organization_id
         LEFT JOIN users u ON u.id = i.invited_by_user_id
        WHERE i.token_hash = $1`, [tokenHash]);
        return rows[0] ?? null;
    }
    async redeemCas(tokenHash, manager) {
        const runner = manager ?? this.dataSource;
        const result = await runner.query(`UPDATE invitations
          SET accepted_at = now()
        WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()
      RETURNING ${INVITATION_ROW_COLUMNS}`, [tokenHash]);
        return this.firstUpdatedRow(result);
    }
    async findDiagnosisByHash(tokenHash) {
        const rows = await this.dataSource.query(`SELECT accepted_at, expires_at FROM invitations WHERE token_hash = $1`, [tokenHash]);
        return rows[0] ?? null;
    }
    async findByClaimedEmail(email) {
        const rows = await this.dataSource.query(`SELECT id FROM users WHERE email = $1 AND is_active = TRUE`, [email]);
        return rows[0] ?? null;
    }
    async deleteIfPending(id) {
        const result = await this.dataSource.query(`DELETE FROM invitations WHERE id = $1 AND accepted_at IS NULL RETURNING id`, [id]);
        return this.firstUpdatedRow(result) !== null;
    }
    async findPendingByOrganization(organizationId) {
        if (organizationId === null) {
            return this.dataSource.query(`SELECT ${INVITATION_ROW_COLUMNS} FROM invitations
          WHERE accepted_at IS NULL AND expires_at > now() AND deleted_at IS NULL
          ORDER BY created_at DESC`);
        }
        return this.dataSource.query(`SELECT ${INVITATION_ROW_COLUMNS} FROM invitations
        WHERE accepted_at IS NULL AND expires_at > now() AND deleted_at IS NULL AND organization_id = $1
        ORDER BY created_at DESC`, [organizationId]);
    }
    firstUpdatedRow(result) {
        const [rows] = result;
        return rows[0] ?? null;
    }
};
exports.InvitationsRepository = InvitationsRepository;
exports.InvitationsRepository = InvitationsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], InvitationsRepository);
//# sourceMappingURL=invitations.repository.js.map