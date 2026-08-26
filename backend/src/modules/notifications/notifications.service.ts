import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { Redis } from 'ioredis';
import { Notification, NotificationType } from './entities/notification.entity';
import { UserEntity } from '../../entities/user.entity';
import { REDIS_CLIENT } from '../../core/core.module';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Crear notificación + publicar vía Redis Pub/Sub + enviar email
   * Deduplicación: no crear si existe notificación idéntica en últimos 60s
   */
  async notify(
    user: UserEntity,
    type: NotificationType,
    message: string,
    incidentId?: string,
    data?: Record<string, unknown>,
  ): Promise<Notification | null> {
    // Dedup: same user, same type, same incident en últimos 60s
    const now = new Date();
    const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);

    const existing = await this.notificationRepo.findOne({
      where: {
        user_id: user.id,
        type,
        ...(incidentId ? { incident_id: incidentId } : {}),
        created_at: MoreThan(sixtySecondsAgo),
        deleted_at: IsNull(),
      },
    });

    if (existing) {
      this.logger.debug(
        `Notification deduplicated: user=${user.id}, type=${type}, incident=${incidentId}`,
      );
      return null;
    }

    const notification = this.notificationRepo.create({
      user_id: user.id,
      incident_id: incidentId || null,
      type,
      message,
      data: (data || {}) as Record<string, unknown>,
      read: false,
    });

    const saved = await this.notificationRepo.save(notification);

    // Publicar a Redis Pub/Sub para entrega en tiempo real
    await this.publishNotification(user.id, saved);

    return saved;
  }

  /**
   * Publicar notificación a canal Redis Pub/Sub del usuario
   */
  private async publishNotification(
    userId: string,
    notification: Notification,
  ): Promise<void> {
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
    } catch (error) {
      this.logger.warn(
        `Failed to publish notification: ${error.message}`,
      );
    }
  }

  /**
   * Listar notificaciones del usuario
   */
  async findByUser(
    userId: string,
    skip = 0,
    take = 20,
  ): Promise<{ data: Notification[]; total: number }> {
    // T7.2.B2/R7.1 — soft-deleted notifications never appear in the list.
    const [data, total] = await this.notificationRepo.findAndCount({
      where: { user_id: userId, deleted_at: IsNull() },
      order: { created_at: 'DESC' },
      skip,
      take,
    });

    return { data, total };
  }

  /**
   * Marcar notificación como leída
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await this.notificationRepo.update(
      { id: notificationId, user_id: userId },
      { read: true },
    );

    return (result.affected ?? 0) > 0;
  }

  /**
   * Marcar todas como leídas
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notificationRepo.update(
      { user_id: userId, read: false },
      { read: true },
    );

    return result.affected ?? 0;
  }

  /**
   * Contar no leídas
   *
   * T7.2.C2 (R7.1) — a soft-deleted notification must not count toward
   * `unread_count`, even if it was never marked read.
   */
  async countUnread(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { user_id: userId, read: false, deleted_at: IsNull() },
    });
  }

}
