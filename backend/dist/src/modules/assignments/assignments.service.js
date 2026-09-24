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
exports.AssignmentsService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const core_module_1 = require("../../core/core.module");
const assignment_entity_1 = require("../../entities/assignment.entity");
const incidents_repository_1 = require("../incidents/incidents.repository");
const incidents_service_1 = require("../incidents/incidents.service");
let AssignmentsService = class AssignmentsService {
    constructor(assignmentRepo, eventEmitter, redis, incidentsRepository) {
        this.assignmentRepo = assignmentRepo;
        this.eventEmitter = eventEmitter;
        this.redis = redis;
        this.incidentsRepository = incidentsRepository;
    }
    async assign(incidentId, operatorId, role = 'primary') {
        const existing = await this.assignmentRepo.findOne({ where: { incidentId, deletedAt: (0, typeorm_2.IsNull)() } });
        if (existing) {
            throw new common_1.ConflictException(`Incident ${incidentId} is already assigned`);
        }
        const entity = this.assignmentRepo.create({ incidentId, operatorId, role });
        const saved = await this.assignmentRepo.save(entity);
        this.eventEmitter.emit('incident.assigned', saved);
        await this.redis.xadd(incidents_service_1.INCIDENTS_STREAM_KEY, '*', 'type', 'incident.assigned', 'data', JSON.stringify(saved));
        return saved;
    }
    async release(assignmentId) {
        const assignment = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
        if (!assignment) {
            throw new common_1.NotFoundException(`Assignment ${assignmentId} not found`);
        }
        await this.assignmentRepo.update(assignmentId, { deletedAt: new Date() });
    }
    async list(incidentId, scope) {
        const incident = await this.incidentsRepository.findOne(incidentId, scope);
        if (!incident) {
            throw new common_1.NotFoundException(`Incident ${incidentId} not found`);
        }
        return this.assignmentRepo.find({ where: { incidentId, deletedAt: (0, typeorm_2.IsNull)() } });
    }
    async update(id, dto) {
        const existing = await this.assignmentRepo.findOne({ where: { id } });
        if (!existing) {
            throw new common_1.NotFoundException(`Assignment ${id} not found`);
        }
        if (!dto.operator_id && !dto.role) {
            throw new common_1.BadRequestException('Provide operator_id and/or role');
        }
        if (dto.operator_id)
            existing.operatorId = dto.operator_id;
        if (dto.role)
            existing.role = dto.role;
        return this.assignmentRepo.save(existing);
    }
    /**
     * GET /assignments/operator/:operatorId/count
     *
     * Returns the count of active (non-soft-deleted) assignments for
     * a given operator. Used by the assignment modal to display operator
     * workload alongside the available incidents.
     *
     * Design decision D4: dedicated COUNT(*) endpoint to avoid N+1
     * queries when rendering operator workload in the modal.
     */
    async countByOperator(operatorId) {
        const count = await this.assignmentRepo.count({
            where: { operatorId, deletedAt: (0, typeorm_2.IsNull)() },
        });
        return { count, operatorId };
    }
};
exports.AssignmentsService = AssignmentsService;
exports.AssignmentsService = AssignmentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(assignment_entity_1.AssignmentEntity)),
    __param(2, (0, common_1.Inject)(core_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        event_emitter_1.EventEmitter2, Function, incidents_repository_1.IncidentsRepository])
], AssignmentsService);
//# sourceMappingURL=assignments.service.js.map