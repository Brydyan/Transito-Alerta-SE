import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from './http.service';

/**
 * 2026-10-17-header-notification-dropdown — shape que retorna el
 * backend `GET /api/notifications`. Antes este interface tenía
 * `related_incident_id` e `is_read` (no coinciden con el wire) y le
 * faltaban `message`, `data`, `updated_at`, `deleted_at`. El bug
 * se manifestaba en runtime: el dropdown no podía leer `incident_id`
 * y `read`, así que el badge y la navegación al click quedaban
 * silenciosamente sin funcionar.
 */
export interface AppNotification {
  id: string;
  user_id: string;
  incident_id: string;
  type: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Wrapper del backend `{ data, total, meta? }`. Mantenemos el shape
 * sin aplanar para no perder el `total` que el dropdown podría usar
 * para "ver todas" en el futuro.
 */
export interface NotificationsResponse {
  data: AppNotification[];
  total?: number;
}

/**
 * 2026-10-17 — consumido por `NotificationDropdownComponent`:
 *   - getNotifications(limit) → lista paginada (default 20)
 *   - getUnreadCount() → badge del bell button
 *   - markAsRead(id) → al click en una notificación
 *   - markAllAsRead() → botón "Marcar todo como leído"
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  constructor(private readonly httpService: HttpService) {}

  getNotifications(limit = 20): Observable<NotificationsResponse> {
    return this.httpService.get<NotificationsResponse>(
      `/notifications?limit=${limit}`,
    );
  }

  getUnreadCount(): Observable<{ count: number }> {
    return this.httpService.get<{ count: number }>('/notifications/unread-count');
  }

  markAsRead(id: string): Observable<AppNotification> {
    return this.httpService.patch<AppNotification>(
      `/notifications/${id}/read`,
      {},
    );
  }

  markAllAsRead(): Observable<void> {
    return this.httpService.patch<void>('/notifications/read-all', {});
  }
}