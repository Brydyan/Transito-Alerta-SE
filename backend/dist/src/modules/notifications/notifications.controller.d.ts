import type { Response } from 'express';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { NotificationsService } from './notifications.service';
import { IncidentApprovalService } from './incident-approval.service';
import { RejectNotificationDto } from './dto/reject-notification.dto';
export declare class NotificationsController {
    private readonly notificationsService;
    private readonly approvalService;
    constructor(notificationsService: NotificationsService, approvalService: IncidentApprovalService);
    findMyNotifications(req: AuthenticatedRequest, skip?: number, take?: number): Promise<{
        data: {
            id: string;
            type: import("./entities/notification.entity").NotificationType;
            message: string;
            incident_id: string | null;
            read: boolean;
            created_at: Date;
        }[];
        total: number;
        unread: number;
    }>;
    countUnread(req: AuthenticatedRequest): Promise<{
        unread_count: number;
    }>;
    sseDeprecated(res: Response): void;
    markAsRead(id: string, req: AuthenticatedRequest): Promise<{
        success: boolean;
    }>;
    markAllAsRead(req: AuthenticatedRequest): Promise<{
        marked: number;
    }>;
    approve(id: string, req: AuthenticatedRequest): Promise<{
        id: string;
        status: import("../../entities/incident.entity").IncidentStatus;
        approvedBy: string | null;
    }>;
    reject(id: string, dto: RejectNotificationDto, req: AuthenticatedRequest): Promise<{
        id: string;
        status: import("../../entities/incident.entity").IncidentStatus;
        rejectedBy: string | null;
        rejectionReason: string | null;
    }>;
}
