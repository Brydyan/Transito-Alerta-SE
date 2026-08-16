import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { NotificationsService } from './notifications.service';

@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /api/notifications
   * Listar notificaciones del usuario actual
   */
  @Get()
  async findMyNotifications(
    @Req() req: Request,
    @Query('skip', ParseIntPipe) skip = 0,
    @Query('take', ParseIntPipe) take = 20,
  ) {
    const userId = (req.user as { id: string }).id;
    const { data, total } =
      await this.notificationsService.findByUser(userId, skip, take);

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

  /**
   * GET /api/notifications/unread
   * Contar notificaciones sin leer
   */
  @Get('unread')
  async countUnread(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const count = await this.notificationsService.countUnread(userId);
    return { unread: count };
  }

  /**
   * PATCH /api/notifications/:id/read
   * Marcar como leída
   */
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const success = await this.notificationsService.markAsRead(id, userId);

    if (!success) {
      throw new BadRequestException('Notification not found or already read');
    }

    return { success: true };
  }

  /**
   * PATCH /api/notifications/read-all
   * Marcar todas como leídas
   */
  @Patch('read-all')
  async markAllAsRead(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    const count = await this.notificationsService.markAllAsRead(userId);
    return { marked: count };
  }
}
