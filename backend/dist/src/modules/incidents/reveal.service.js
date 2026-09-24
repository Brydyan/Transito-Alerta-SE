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
var RevealService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevealService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const audit_service_1 = require("../audit/audit.service");
const incidents_repository_1 = require("./incidents.repository");
let RevealService = RevealService_1 = class RevealService {
    constructor(incidentsRepository, auditService, dataSource) {
        this.incidentsRepository = incidentsRepository;
        this.auditService = auditService;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(RevealService_1.name);
    }
    async reveal(incidentId, masterId, input) {
        return this.dataSource.transaction(async (manager) => {
            const incidentRows = await manager.query(`SELECT id, is_anonymous FROM incidents WHERE id = $1 AND deleted_at IS NULL`, [incidentId]);
            const incident = incidentRows[0];
            if (!incident) {
                throw new common_1.NotFoundException('Incident not found');
            }
            if (!incident.is_anonymous) {
                throw new common_1.NotFoundException('Incident is not anonymous; nothing to reveal');
            }
            const reporterRows = await manager.query(`SELECT u.id, u.email, u.first_name
           FROM incident_reporters r
           JOIN users u ON u.id = r.user_id
          WHERE r.incident_id = $1
          LIMIT 1`, [incidentId]);
            const reporter = reporterRows[0];
            if (!reporter) {
                throw new common_1.InternalServerErrorException({
                    code: 'ANONYMOUS_AUTHORSHIP_MISSING',
                    message: `Anonymous incident ${incidentId} has no entry in incident_reporters. ` +
                        'Migrations 0001, 0046, 0048 must be applied and the incident must have a sealed author.',
                });
            }
            await this.auditService.record({
                actorId: masterId,
                action: 'REVEAL',
                resourceType: 'incidents',
                resourceId: incidentId,
                justification: input.justification,
                metadata: input.caseRef
                    ? { case_ref: input.caseRef }
                    : {},
            }, manager);
            this.logger.log(`REVEAL: master=${masterId} revealed incident=${incidentId} reporter=${reporter.id}`);
            return {
                incident_id: incidentId,
                reporter: {
                    id: reporter.id,
                    email: reporter.email,
                    first_name: reporter.first_name,
                },
            };
        });
    }
    async listReveals(incidentId) {
        const rows = await this.dataSource.query(`SELECT actor_id AS revealed_by, created_at AS revealed_at, justification,
              metadata->>'case_ref' AS case_ref
         FROM audit_events
        WHERE action = 'REVEAL'
          AND resource_type = 'incidents'
          AND resource_id = $1
        ORDER BY created_at ASC`, [incidentId]);
        return rows;
    }
};
exports.RevealService = RevealService;
exports.RevealService = RevealService = RevealService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [incidents_repository_1.IncidentsRepository,
        audit_service_1.AuditService,
        typeorm_2.DataSource])
], RevealService);
//# sourceMappingURL=reveal.service.js.map