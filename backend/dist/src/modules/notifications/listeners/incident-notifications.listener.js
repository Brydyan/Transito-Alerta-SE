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
var IncidentNotificationsListener_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentNotificationsListener = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const notifications_service_1 = require("../notifications.service");
const users_service_1 = require("../../users/users.service");
const notification_entity_1 = require("../entities/notification.entity");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
let IncidentNotificationsListener = IncidentNotificationsListener_1 = class IncidentNotificationsListener {
    constructor(notificationsService, usersService, dataSource) {
        this.notificationsService = notificationsService;
        this.usersService = usersService;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(IncidentNotificationsListener_1.name);
    }
    async onIncidentCreated(payload) {
        try {
            const admins = await this.usersService.findByRole('admin');
            for (const admin of admins) {
                if (admin?.id) {
                    await this.notificationsService.notify(admin, notification_entity_1.NotificationType.INCIDENT_CREATED, `Nuevo incidente: ${payload.title}`, payload.incidentId, {
                        location: payload.location,
                        createdBy: payload.createdById,
                    });
                }
            }
        }
        catch (error) {
            this.logger.error(`Error notifying incident.created: ${error.message}`);
        }
    }
    async onIncidentAssigned(payload) {
        try {
            const user = await this.usersService.findOne(payload.assignedToId);
            if (user?.id) {
                await this.notificationsService.notify(user, notification_entity_1.NotificationType.INCIDENT_ASSIGNED, `Te han asignado el incidente: ${payload.title}`, payload.incidentId, {
                    assignedBy: payload.assignedById,
                });
            }
        }
        catch (error) {
            this.logger.error(`Error notifying incident.assigned: ${error.message}`);
        }
    }
    async onIncidentStatusChanged(payload) {
        try {
            const reporterId = payload.citizen_id;
            const assigneeId = payload.assigned_to;
            const actorId = payload.actor_id;
            const followers = await this.dataSource.query('SELECT user_id FROM incident_followers WHERE incident_id = $1', [payload.id]);
            const followerIds = followers.map(f => f.user_id);
            const recipientIds = Array.from(new Set([
                ...[reporterId, assigneeId].filter(id => Boolean(id)),
                ...followerIds
            ])).filter(id => id !== actorId);
            for (const userId of recipientIds) {
                const user = await this.usersService.findOne(userId);
                if (user?.id) {
                    await this.notificationsService.notify(user, notification_entity_1.NotificationType.INCIDENT_STATUS_CHANGED, `Estado del incidente actualizado: ${payload.status}`, payload.id, {
                        status: payload.status,
                    });
                }
            }
        }
        catch (error) {
            this.logger.error(`Error notifying incident.status_changed: ${error.message}`);
        }
    }
    async onCommentAdded(payload) {
        try {
            const reporterId = payload.reporter_id;
            const priorCommenterIds = payload.prior_commenter_ids ?? [];
            const recipientIds = [reporterId, ...priorCommenterIds].filter((id) => Boolean(id));
            for (const userId of recipientIds) {
                if (userId === payload.author_id)
                    continue;
                const user = await this.usersService.findOne(userId);
                if (user?.id) {
                    await this.notificationsService.notify(user, notification_entity_1.NotificationType.COMMENT_ADDED, `Nuevo comentario en el incidente`, payload.incident_id, {
                        commentId: payload.id,
                        author: payload.author_id,
                    });
                }
            }
        }
        catch (error) {
            this.logger.error(`Error notifying comment.added: ${error.message}`);
        }
    }
};
exports.IncidentNotificationsListener = IncidentNotificationsListener;
__decorate([
    (0, event_emitter_1.OnEvent)('incident.created'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IncidentNotificationsListener.prototype, "onIncidentCreated", null);
__decorate([
    (0, event_emitter_1.OnEvent)('incident.assigned'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IncidentNotificationsListener.prototype, "onIncidentAssigned", null);
__decorate([
    (0, event_emitter_1.OnEvent)('incident.status_changed'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IncidentNotificationsListener.prototype, "onIncidentStatusChanged", null);
__decorate([
    (0, event_emitter_1.OnEvent)('comment.added'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IncidentNotificationsListener.prototype, "onCommentAdded", null);
exports.IncidentNotificationsListener = IncidentNotificationsListener = IncidentNotificationsListener_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService,
        users_service_1.UsersService,
        typeorm_2.DataSource])
], IncidentNotificationsListener);
//# sourceMappingURL=incident-notifications.listener.js.map