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
exports.StatusHistoryService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const scope_sql_1 = require("../../common/authz/scope-sql");
const status_history_repository_1 = require("./status-history.repository");
let StatusHistoryService = class StatusHistoryService {
    constructor(dataSource, statusHistoryRepository) {
        this.dataSource = dataSource;
        this.statusHistoryRepository = statusHistoryRepository;
    }
    async findByIncident(incidentId, scope) {
        const scopeSql = (0, scope_sql_1.scopeToSql)(scope, { table: 'incidents', paramOffset: 2 });
        const rows = await this.dataSource.query(`SELECT 1 FROM incidents WHERE id = $1 AND (${scopeSql.fragment}) LIMIT 1`, [incidentId, ...scopeSql.params]);
        if (rows.length === 0) {
            throw new common_1.NotFoundException(`Incident ${incidentId} not found`);
        }
        const items = await this.statusHistoryRepository.findByIncident(incidentId);
        return { items, total: items.length };
    }
};
exports.StatusHistoryService = StatusHistoryService;
exports.StatusHistoryService = StatusHistoryService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        status_history_repository_1.StatusHistoryRepository])
], StatusHistoryService);
//# sourceMappingURL=status-history.service.js.map