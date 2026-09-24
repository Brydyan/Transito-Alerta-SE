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
exports.IncidentWorkflowService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const core_module_1 = require("../../core/core.module");
const geofencing_service_1 = require("../geofencing/geofencing.service");
const incidents_service_1 = require("./incidents.service");
const organization_entity_1 = require("../../entities/organization.entity");
const incident_state_machine_1 = require("./incident-state-machine");
const incident_workflow_errors_1 = require("./incident-workflow.errors");
const incidents_repository_1 = require("./incidents.repository");
const SYSTEM_ADMIN_ROLE = 'master';
let IncidentWorkflowService = class IncidentWorkflowService {
    constructor(dataSource, orgRepo, geofencingService, eventEmitter, redis) {
        this.dataSource = dataSource;
        this.orgRepo = orgRepo;
        this.geofencingService = geofencingService;
        this.eventEmitter = eventEmitter;
        this.redis = redis;
    }
    async claim(incidentId, operator) {
        const incident = await this.loadIncident(incidentId);
        if (operator.role !== SYSTEM_ADMIN_ROLE &&
            incident.organization_id !== operator.organizationId) {
            throw new common_1.ForbiddenException(incident_workflow_errors_1.WRONG_ORGANIZATION);
        }
        if (incident.organization_id) {
            const maxActive = await this.maxActiveClaimsFor(incident.organization_id);
            const active = await this.activeClaimCountFor(operator.id);
            if (active >= maxActive) {
                throw new common_1.HttpException(incident_workflow_errors_1.CLAIM_LIMIT_REACHED, common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
        }
        const result = await this.dataSource.query(`UPDATE incidents
         SET claimed_by = $1, claimed_at = NOW()
       WHERE id = $2 AND claimed_by IS NULL
       RETURNING id, title, status, priority, claimed_by, organization_id, updated_at`, [operator.id, incidentId]);
        const rows = (0, incidents_repository_1.unwrapReturningRows)(result);
        if (rows.length === 0) {
            throw new common_1.ConflictException(incident_workflow_errors_1.INCIDENT_ALREADY_CLAIMED);
        }
        return this.toResponse(rows[0]);
    }
    async release(incidentId, operator) {
        const incident = await this.loadIncident(incidentId);
        if (incident.claimed_by === null) {
            throw new common_1.ConflictException(incident_workflow_errors_1.INCIDENT_NOT_CLAIMED);
        }
        if (incident.claimed_by !== operator.id) {
            throw new common_1.ForbiddenException(incident_workflow_errors_1.NOT_THE_CLAIMER);
        }
        const result = await this.dataSource.query(`UPDATE incidents
         SET claimed_by = NULL
       WHERE id = $1
       RETURNING id, title, status, priority, claimed_by, organization_id, updated_at`, [incidentId]);
        const rows = (0, incidents_repository_1.unwrapReturningRows)(result);
        return this.toResponse(rows[0]);
    }
    async availableOperators(incidentId) {
        const incident = await this.loadIncident(incidentId);
        if (!incident.organization_id) {
            return [];
        }
        const maxActive = await this.maxActiveClaimsFor(incident.organization_id);
        const rows = await this.dataSource.query(`SELECT u.id,
              u.device_uuid AS name,
              u.email,
              COALESCE((
                SELECT COUNT(*)::int
                  FROM incidents
                 WHERE claimed_by = u.id AND status = 'in_progress'
              ), 0) AS active_count
         FROM users u
         JOIN roles r ON r.id = u.role_id
        WHERE u.organization_id = $1
          AND u.is_active = true
          AND r.name IN ('operador_org', 'operador_sistema')
          AND ($2::uuid IS NULL OR u.id <> $2::uuid)
          AND COALESCE((
                SELECT COUNT(*)
                  FROM incidents
                 WHERE claimed_by = u.id AND status = 'in_progress'
              ), 0) < $3`, [incident.organization_id, incident.claimed_by, maxActive]);
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            email: r.email,
            activeClaimCount: Number(r.active_count),
        }));
    }
    getStatuses() {
        return [...incident_state_machine_1.ALLOWED_STATUSES];
    }
    canTransition(from, to) {
        return (0, incident_state_machine_1.canTransition)(from, to);
    }
    async changeStatus(args) {
        const { incidentId, to, actorId, actorPermissions, closedReason } = args;
        const committed = await this.dataSource.transaction(async (manager) => {
            const currentRows = await manager.query(`SELECT id, title, status, priority, claimed_by, organization_id, closed_reason
           FROM incidents
          WHERE id = $1
          FOR UPDATE`, [incidentId]);
            if (currentRows.length === 0) {
                throw new common_1.NotFoundException(`Incident ${incidentId} not found`);
            }
            const from = currentRows[0].status;
            if (!(0, incident_state_machine_1.canTransition)(from, to)) {
                throw new common_1.ConflictException({
                    code: incident_workflow_errors_1.INCIDENT_INVALID_TRANSITION,
                    message: `Illegal status transition: ${from} -> ${to}`,
                    from,
                    to,
                });
            }
            if (to === 'closed') {
                if (!closedReason || closedReason.trim().length === 0) {
                    throw new common_1.UnprocessableEntityException({
                        code: 'INCIDENT_CLOSED_REASON_REQUIRED',
                        message: 'closing an incident requires a non-empty reason',
                    });
                }
                if (!actorPermissions.includes('CLOSE incidents')) {
                    throw new common_1.ForbiddenException({
                        code: 'INCIDENT_CLOSE_PERMISSION_REQUIRED',
                        message: 'closing an incident requires the CLOSE incidents permission',
                    });
                }
            }
            const isResolution = to === 'resolved';
            const closedReasonValue = to === 'closed' ? (closedReason ?? null) : null;
            const result = await manager.query(`UPDATE incidents
            SET status = $2,
                closed_reason = $3,
                resolution_date = CASE WHEN $4 THEN NOW() ELSE NULL END
          WHERE id = $1
        RETURNING id, title, status, priority, claimed_by, organization_id,
                  zone_id, closed_reason, citizen_id, assigned_to`, [incidentId, to, closedReasonValue, isResolution]);
            const updated = (0, incidents_repository_1.unwrapReturningRows)(result)[0];
            if (!updated) {
                throw new common_1.NotFoundException(`Incident ${incidentId} not found`);
            }
            const historyNotes = to === 'closed' ? `[closed] ${closedReason}` : null;
            await manager.query(`INSERT INTO status_history
            (incident_id, changed_by_user_id, previous_status, new_status, notes, event_id)
         VALUES ($1, $2, $3, $4, $5, gen_random_uuid()::text)`, [incidentId, actorId, from, to, historyNotes]);
            return { updated: updated, from };
        });
        await this.purgeListCaches(committed.updated.zone_id);
        await this.publish('incident.status_changed', {
            id: committed.updated.id,
            status: committed.updated.status,
            previous_status: committed.from,
            zone_id: committed.updated.zone_id,
            citizen_id: committed.updated.citizen_id,
            assigned_to: committed.updated.assigned_to,
            actor_id: actorId,
        });
        return committed.updated;
    }
    async purgeListCaches(zoneId) {
        await this.geofencingService.purgeZoneCache(zoneId);
        await this.geofencingService.purgeZoneCache(geofencing_service_1.ALL_ZONES_TAG);
    }
    async publish(type, data) {
        this.eventEmitter.emit(type, data);
        await this.redis.xadd(incidents_service_1.INCIDENTS_STREAM_KEY, '*', 'type', type, 'data', JSON.stringify(data));
    }
    async loadIncident(incidentId) {
        const rows = await this.dataSource.query(`SELECT id, title, status, priority, claimed_by, organization_id, updated_at
         FROM incidents
        WHERE id = $1`, [incidentId]);
        if (rows.length === 0) {
            throw new common_1.NotFoundException(`Incident ${incidentId} not found`);
        }
        return rows[0];
    }
    async maxActiveClaimsFor(orgId) {
        const org = await this.orgRepo.findOne({ where: { id: orgId } });
        return org?.maxActiveClaims ?? 5;
    }
    async activeClaimCountFor(userId) {
        const rows = await this.dataSource.query(`SELECT COUNT(*)::int AS count
         FROM incidents
        WHERE claimed_by = $1 AND status = 'in_progress'`, [userId]);
        return Number(rows[0]?.count ?? 0);
    }
    toResponse(row) {
        return {
            id: row.id,
            title: row.title,
            status: row.status,
            priority: row.priority,
            claimedBy: row.claimed_by,
            organizationId: row.organization_id,
            updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
        };
    }
};
exports.IncidentWorkflowService = IncidentWorkflowService;
exports.IncidentWorkflowService = IncidentWorkflowService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(organization_entity_1.OrganizationEntity)),
    __param(4, (0, common_1.Inject)(core_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        typeorm_2.Repository,
        geofencing_service_1.GeofencingService,
        event_emitter_1.EventEmitter2, Function])
], IncidentWorkflowService);
//# sourceMappingURL=incident-workflow.service.js.map