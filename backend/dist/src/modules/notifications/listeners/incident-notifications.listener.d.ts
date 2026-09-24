import { NotificationsService } from '../notifications.service';
import { UsersService } from '../../users/users.service';
import { DataSource } from 'typeorm';
export declare class IncidentNotificationsListener {
    private readonly notificationsService;
    private readonly usersService;
    private readonly dataSource;
    private readonly logger;
    constructor(notificationsService: NotificationsService, usersService: UsersService, dataSource: DataSource);
    onIncidentCreated(payload: {
        incidentId: string;
        createdById: string;
        title: string;
        location: {
            lat: number;
            lng: number;
        };
    }): Promise<void>;
    onIncidentAssigned(payload: {
        incidentId: string;
        assignedToId: string;
        assignedById: string;
        title: string;
    }): Promise<void>;
    onIncidentStatusChanged(payload: Record<string, unknown>): Promise<void>;
    onCommentAdded(payload: Record<string, unknown>): Promise<void>;
}
