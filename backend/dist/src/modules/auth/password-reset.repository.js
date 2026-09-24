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
exports.PasswordResetRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
let PasswordResetRepository = class PasswordResetRepository {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async insert(userId, tokenHash) {
        const rows = await this.dataSource.query(`INSERT INTO password_reset_tokens (user_id, token_hash)
       VALUES ($1, $2)
       RETURNING id, user_id, token_hash, used_at, expires_at, created_at`, [userId, tokenHash]);
        return rows[0];
    }
    async casConsume(tokenHash, manager) {
        const runner = manager ?? this.dataSource;
        const result = await runner.query(`UPDATE password_reset_tokens
          SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING id, user_id, token_hash, used_at, expires_at, created_at`, [tokenHash]);
        return this.firstUpdatedRow(result);
    }
    async findDiagnosisByHash(tokenHash) {
        const rows = await this.dataSource.query(`SELECT used_at, expires_at FROM password_reset_tokens WHERE token_hash = $1`, [tokenHash]);
        return rows[0] ?? null;
    }
    firstUpdatedRow(result) {
        const [rows] = result;
        return rows[0] ?? null;
    }
};
exports.PasswordResetRepository = PasswordResetRepository;
exports.PasswordResetRepository = PasswordResetRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], PasswordResetRepository);
//# sourceMappingURL=password-reset.repository.js.map