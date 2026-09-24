import { Repository } from 'typeorm';
import { Redis } from 'ioredis';
import { Notification, NotificationType } from './entities/notification.entity';
import { UserEntity } from '../../entities/user.entity';
export declare class NotificationsService {
    private readonly notificationRepo;
    private readonly redis;
    private readonly logger;
    constructor(notificationRepo: Repository<Notification>, redis: Redis);
    notify(user: UserEntity, type: NotificationType, message: string, incidentId?: string, data?: Record<string, unknown>): Promise<Notification | null>;
    private publishNotification;
    findByUser(userId: string, skip?: number, take?: number): Promise<{
        data: Notification[];
        total: number;
    }>;
    markAsRead(notificationId: string, userId: string): Promise<boolean>;
    markAllAsRead(userId: string): Promise<number>;
    countUnread(userId: string): Promise<number>;
}
