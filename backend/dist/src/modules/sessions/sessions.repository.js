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
exports.SessionsRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const session_validity_1 = require("./session-validity");
const SESSION_ROW_COLUMNS = `id, user_id, device_uuid, created_at, refresh_token_hash,
       previous_refresh_token_hash, rotated_at, ip_address, user_agent,
       revoked_at, last_used_at, expires_at`;
let SessionsRepository = class SessionsRepository {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async create(input) {
        const rows = await this.dataSource.query(`INSERT INTO user_sessions
         (id, user_id, device_uuid, refresh_token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7::int))
       RETURNING ${SESSION_ROW_COLUMNS}`, [
            input.id,
            input.userId,
            input.deviceUuid,
            input.refreshTokenHash,
            input.ipAddress,
            input.userAgent,
            input.ttlSeconds,
        ]);
        return rows[0];
    }
    async findActiveById(id) {
        const rows = await this.dataSource.query(`SELECT ${SESSION_ROW_COLUMNS}
         FROM user_sessions
        WHERE id = $1 AND ${session_validity_1.ACTIVE_SESSION_SQL}`, [id]);
        return rows[0] ?? null;
    }
    async findActiveByUser(userId) {
        return this.dataSource.query(`SELECT ${SESSION_ROW_COLUMNS}
         FROM user_sessions
        WHERE user_id = $1 AND ${session_validity_1.ACTIVE_SESSION_SQL}
        ORDER BY created_at DESC`, [userId]);
    }
    async rotate(input) {
        const result = await this.dataSource.query(`UPDATE user_sessions
          SET previous_refresh_token_hash = refresh_token_hash,
              refresh_token_hash          = $2,
              rotated_at                  = now(),
              last_used_at                = now(),
              expires_at                  = now() + make_interval(secs => $3::int),
              ip_address                  = $4,
              user_agent                  = $5
        WHERE id                 = $1
          AND refresh_token_hash = $6
          AND revoked_at IS NULL
          AND expires_at > now()
      RETURNING ${SESSION_ROW_COLUMNS}`, [
            input.id,
            input.newHash,
            input.ttlSeconds,
            input.ipAddress,
            input.userAgent,
            input.expectedHash,
        ]);
        return this.firstUpdatedRow(result);
    }
    async revoke(id) {
        const result = await this.dataSource.query(`UPDATE user_sessions
          SET revoked_at = now()
        WHERE id = $1 AND revoked_at IS NULL
      RETURNING ${SESSION_ROW_COLUMNS}`, [id]);
        return this.firstUpdatedRow(result);
    }
    firstUpdatedRow(result) {
        const [rows] = result;
        return rows[0] ?? null;
    }
    updatedRows(result) {
        const [rows] = result;
        return rows;
    }
    async revokeAllForUser(userId) {
        const result = await this.dataSource.query(`UPDATE user_sessions
          SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      RETURNING id, expires_at`, [userId]);
        return this.updatedRows(result);
    }
    async existsRevoked(id) {
        const rows = await this.dataSource.query(`SELECT EXISTS(SELECT 1 FROM user_sessions WHERE id = $1 AND revoked_at IS NOT NULL) AS exists`, [id]);
        return rows[0]?.exists ?? false;
    }
    async findRevokedUnexpired() {
        return this.dataSource.query(`SELECT id, expires_at
         FROM user_sessions
        WHERE revoked_at IS NOT NULL AND expires_at > now()`);
    }
    async findManageableTarget(userId) {
        const rows = await this.dataSource.query(`SELECT u.id, u.organization_id, r.name AS role_name
           FROM users u
           LEFT JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1`, [userId]);
        const row = rows[0];
        if (!row) {
            return null;
        }
        return { id: row.id, organizationId: row.organization_id, roleName: row.role_name };
    }
};
exports.SessionsRepository = SessionsRepository;
exports.SessionsRepository = SessionsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], SessionsRepository);
//# sourceMappingURL=sessions.repository.js.map