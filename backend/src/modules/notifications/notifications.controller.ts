import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Req,
  BadRequestException,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { NotificationsService } from './notifications.service';
import { IncidentApprovalService } from './incident-approval.service';
import { RejectNotificationDto } from './dto/reject-notification.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly approvalService: IncidentApprovalService,
  ) {}

  /**
   * GET /api/notifications
   * Listar notificaciones del usuario actual
   */
  @Get()
  async findMyNotifications(
    @Req() req: AuthenticatedRequest,
    @Query('skip', ParseIntPipe) skip = 0,
    @Query('take', ParseIntPipe) take = 20,
  ) {
    const userId = req.user!.userId;
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
  async countUnread(@Req() req: AuthenticatedRequest) {
    const userId = req.user!.userId;
    const count = await this.notificationsService.countUnread(userId);
    return { unread: count };
  }

  /**
   * PATCH /api/notifications/:id/read
   * Marcar como leída
   */
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user!.userId;
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
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    const userId = req.user!.userId;
    const count = await this.notificationsService.markAllAsRead(userId);
    return { marked: count };
  }

  // ---- T5.6 admin approve/reject — requires UPDATE notifications

  @Post(':id/approve')
  @RequirePermission('UPDATE')
  async approve(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const actorId = req.user!.userId;
    const incident = await this.approvalService.approve(id, actorId);
    return { id: incident.id, status: incident.status, approvedBy: incident.approvedBy };
  }

  @Post(':id/reject')
  @RequirePermission('UPDATE')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectNotificationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const actorId = req.user!.userId;
    const incident = await this.approvalService.reject(id, actorId, dto.reason);
    return {
      id: incident.id,
      status: incident.status,
      rejectedBy: incident.rejectedBy,
      rejectionReason: incident.rejectionReason,
    };
  }
}
