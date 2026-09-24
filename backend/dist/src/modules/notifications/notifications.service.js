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
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const ioredis_1 = require("ioredis");
const notification_entity_1 = require("./entities/notification.entity");
const core_module_1 = require("../../core/core.module");
let NotificationsService = NotificationsService_1 = class NotificationsService {
    constructor(notificationRepo, redis) {
        this.notificationRepo = notificationRepo;
        this.redis = redis;
        this.logger = new common_1.Logger(NotificationsService_1.name);
    }
    async notify(user, type, message, incidentId, data) {
        const now = new Date();
        const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);
        const existing = await this.notificationRepo.findOne({
            where: {
                user_id: user.id,
                type,
                ...(incidentId ? { incident_id: incidentId } : {}),
                created_at: (0, typeorm_2.MoreThan)(sixtySecondsAgo),
                deleted_at: (0, typeorm_2.IsNull)(),
            },
        });
        if (existing) {
            this.logger.debug(`Notification deduplicated: user=${user.id}, type=${type}, incident=${incidentId}`);
            return null;
        }
        const notification = this.notificationRepo.create({
            user_id: user.id,
            incident_id: incidentId || null,
            type,
            message,
            data: (data || {}),
            read: false,
        });
        const saved = await this.notificationRepo.save(notification);
        await this.publishNotification(user.id, saved);
        return saved;
    }
    async publishNotification(userId, notification) {
        try {
            const channel = `user:${userId}:notifications`;
            const payload = {
                id: notification.id,
                type: notification.type,
                message: notification.message,
                data: notification.data,
                created_at: notification.created_at.toISOString(),
            };
            await this.redis.publish(channel, JSON.stringify(payload));
        }
        catch (error) {
            this.logger.warn(`Failed to publish notification: ${error.message}`);
        }
    }
    async findByUser(userId, skip = 0, take = 20) {
        const [data, total] = await this.notificationRepo.findAndCount({
            where: { user_id: userId, deleted_at: (0, typeorm_2.IsNull)() },
            order: { created_at: 'DESC' },
            skip,
            take,
        });
        return { data, total };
    }
    async markAsRead(notificationId, userId) {
        const result = await this.notificationRepo.update({ id: notificationId, user_id: userId }, { read: true });
        return (result.affected ?? 0) > 0;
    }
    async markAllAsRead(userId) {
        const result = await this.notificationRepo.update({ user_id: userId, read: false }, { read: true });
        return result.affected ?? 0;
    }
    async countUnread(userId) {
        return this.notificationRepo.count({
            where: { user_id: userId, read: false, deleted_at: (0, typeorm_2.IsNull)() },
        });
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(notification_entity_1.Notification)),
    __param(1, (0, common_1.Inject)(core_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        ioredis_1.Redis])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map