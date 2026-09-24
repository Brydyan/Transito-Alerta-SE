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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const notifications_service_1 = require("./notifications.service");
const incident_approval_service_1 = require("./incident-approval.service");
const reject_notification_dto_1 = require("./dto/reject-notification.dto");
const require_permission_decorator_1 = require("../../common/decorators/require-permission.decorator");
const permission_guard_1 = require("../../common/guards/permission.guard");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let NotificationsController = class NotificationsController {
    constructor(notificationsService, approvalService) {
        this.notificationsService = notificationsService;
        this.approvalService = approvalService;
    }
    async findMyNotifications(req, skip = 0, take = 20) {
        const userId = req.user.userId;
        const { data, total } = await this.notificationsService.findByUser(userId, skip, take);
        return {
            data: data.map((n) => ({
                id: n.id,
                type: n.type,
                message: n.message,
                incident_id: n.incident_id,
                read: n.read,
                created_at: n.created_at,
            })),
            total,
            unread: await this.notificationsService.countUnread(userId),
        };
    }
    async countUnread(req) {
        const userId = req.user.userId;
        const count = await this.notificationsService.countUnread(userId);
        return { unread_count: count };
    }
    sseDeprecated(res) {
        res.status(410).json({
            message: 'This endpoint has been replaced by Socket.IO realtime events. See /api/docs for details.',
        });
    }
    async markAsRead(id, req) {
        const userId = req.user.userId;
        const success = await this.notificationsService.markAsRead(id, userId);
        if (!success) {
            throw new common_1.BadRequestException('Notification not found or already read');
        }
        return { success: true };
    }
    async markAllAsRead(req) {
        const userId = req.user.userId;
        const count = await this.notificationsService.markAllAsRead(userId);
        return { marked: count };
    }
    async approve(id, req) {
        const actorId = req.user.userId;
        const incident = await this.approvalService.approve(id, actorId);
        return { id: incident.id, status: incident.status, approvedBy: incident.approvedBy };
    }
    async reject(id, dto, req) {
        const actorId = req.user.userId;
        const incident = await this.approvalService.reject(id, actorId, dto.reason);
        return {
            id: incident.id,
            status: incident.status,
            rejectedBy: incident.rejectedBy,
            rejectionReason: incident.rejectionReason,
        };
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('skip', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('take', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "findMyNotifications", null);
__decorate([
    (0, common_1.Get)(['unread', 'unread-count']),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "countUnread", null);
__decorate([
    (0, common_1.Get)('stream'),
    (0, common_1.HttpCode)(410),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "sseDeprecated", null);
__decorate([
    (0, common_1.Patch)(':id/read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markAsRead", null);
__decorate([
    (0, common_1.Patch)('read-all'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markAllAsRead", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, require_permission_decorator_1.RequirePermission)('UPDATE'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, require_permission_decorator_1.RequirePermission)('UPDATE'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, reject_notification_dto_1.RejectNotificationDto, Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "reject", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, common_1.Controller)('notifications'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService,
        incident_approval_service_1.IncidentApprovalService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map