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
var IncidentApprovalService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentApprovalService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const comment_entity_1 = require("../../entities/comment.entity");
const incident_entity_1 = require("../../entities/incident.entity");
const notification_entity_1 = require("./entities/notification.entity");
let IncidentApprovalService = IncidentApprovalService_1 = class IncidentApprovalService {
    constructor(dataSource, incidentRepo, commentRepo) {
        this.dataSource = dataSource;
        this.incidentRepo = incidentRepo;
        this.commentRepo = commentRepo;
        this.logger = new common_1.Logger(IncidentApprovalService_1.name);
    }
    async approve(notificationId, actorId) {
        return this.dataSource.transaction(async (manager) => {
            const notif = await this.lockNotification(manager, notificationId);
            this.assertPending(notif);
            if (!notif.incident_id) {
                throw new common_1.ConflictException(`Notification ${notificationId} has no incident_id — cannot approve`);
            }
            const incident = await this.lockIncident(manager, notif.incident_id);
            if (incident.status !== 'resolved') {
                throw new common_1.ConflictException(`Incident ${incident.id} is not in 'resolved' state (current: ${incident.status})`);
            }
            await manager.queryRunner.query(`UPDATE incidents
         SET approved_by = $1, approved_at = NOW(),
             rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
         WHERE id = $2`, [actorId, incident.id]);
            const updated = await manager.getRepository(incident_entity_1.IncidentEntity).findOneOrFail({ where: { id: incident.id } });
            await this.markNotificationAndSiblingsProcessed(manager, notificationId, notif.incident_id);
            this.logger.log(`Incident ${incident.id} approved by ${actorId} (notification ${notificationId})`);
            return updated;
        });
    }
    async reject(notificationId, actorId, reason) {
        return this.dataSource.transaction(async (manager) => {
            const notif = await this.lockNotification(manager, notificationId);
            this.assertPending(notif);
            if (!notif.incident_id) {
                throw new common_1.ConflictException(`Notification ${notificationId} has no incident_id — cannot reject`);
            }
            const incident = await this.lockIncident(manager, notif.incident_id);
            if (incident.status !== 'resolved') {
                throw new common_1.ConflictException(`Incident ${incident.id} is not in 'resolved' state (current: ${incident.status})`);
            }
            const _stillClaimed = await this.operatorStillActive(manager, incident.claimedBy);
            void _stillClaimed;
            await manager.queryRunner.query(`UPDATE incidents
         SET rejected_by = $1, rejected_at = NOW(), rejection_reason = $2,
             approved_by = NULL, approved_at = NULL
         WHERE id = $3`, [actorId, reason, incident.id]);
            const updated = await manager.getRepository(incident_entity_1.IncidentEntity).findOneOrFail({ where: { id: incident.id } });
            await manager.getRepository(comment_entity_1.CommentEntity).save({
                incidentId: incident.id,
                userId: actorId,
                content: `[admin reject] ${reason}`,
            });
            await this.markNotificationAndSiblingsProcessed(manager, notificationId, notif.incident_id);
            this.logger.log(`Incident ${incident.id} rejected by ${actorId} (notification ${notificationId})`);
            return updated;
        });
    }
    async lockNotification(manager, id) {
        const notif = await manager
            .getRepository(notification_entity_1.Notification)
            .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!notif) {
            throw new common_1.NotFoundException(`Notification ${id} not found`);
        }
        if (notif.type !== notification_entity_1.NotificationType.INCIDENT_PENDING_APPROVAL) {
            throw new common_1.ConflictException(`Notification ${id} is not an incident_pending_approval (type: ${notif.type})`);
        }
        return notif;
    }
    assertPending(notif) {
        if (notif.processed_at !== null) {
            throw new common_1.ConflictException(`Notification ${id(notif)} was already processed at ${notif.processed_at.toISOString()}`);
        }
    }
    async lockIncident(manager, id) {
        const incident = await manager
            .getRepository(incident_entity_1.IncidentEntity)
            .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!incident) {
            throw new common_1.NotFoundException(`Incident ${id} not found`);
        }
        return incident;
    }
    async markNotificationAndSiblingsProcessed(manager, notificationId, incidentId) {
        const now = new Date();
        const repo = manager.getRepository(notification_entity_1.Notification);
        await repo.update(notificationId, { processed_at: now, read: true });
        await repo
            .createQueryBuilder()
            .update()
            .set({ processed_at: now, read: true })
            .where('incident_id = :incidentId', { incidentId })
            .andWhere('type = :type', { type: notification_entity_1.NotificationType.INCIDENT_PENDING_APPROVAL })
            .andWhere('processed_at IS NULL')
            .andWhere('id != :notificationId', { notificationId })
            .execute();
    }
    async operatorStillActive(manager, userId) {
        if (!userId)
            return false;
        const user = await manager.getRepository('UserEntity').findOne({
            where: { id: userId, isActive: true },
        });
        return user != null;
    }
};
exports.IncidentApprovalService = IncidentApprovalService;
exports.IncidentApprovalService = IncidentApprovalService = IncidentApprovalService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(incident_entity_1.IncidentEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(comment_entity_1.CommentEntity)),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        typeorm_2.Repository,
        typeorm_2.Repository])
], IncidentApprovalService);
function id(notif) {
    return notif.id;
}
//# sourceMappingURL=incident-approval.service.js.map