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
exports.StatusHistoryRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const status_history_entity_1 = require("../../entities/status-history.entity");
let StatusHistoryRepository = class StatusHistoryRepository {
    constructor(dataSource, ormRepo) {
        this.dataSource = dataSource;
        this.ormRepo = ormRepo;
    }
    async insert(data) {
        return this.dataSource.query(`INSERT INTO status_history
         (incident_id, changed_by_user_id, previous_status, new_status, event_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`, [data.incidentId, data.changedByUserId, data.previousStatus, data.newStatus, data.eventId]);
    }
    findByIncident(incidentId) {
        return this.ormRepo.find({
            where: { incidentId },
            order: { createdAt: 'ASC', id: 'ASC' },
        });
    }
};
exports.StatusHistoryRepository = StatusHistoryRepository;
exports.StatusHistoryRepository = StatusHistoryRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __param(1, (0, typeorm_1.InjectRepository)(status_history_entity_1.StatusHistoryEntity)),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        typeorm_2.Repository])
], StatusHistoryRepository);
//# sourceMappingURL=status-history.repository.js.map