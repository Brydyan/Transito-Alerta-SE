import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from './http.service';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  related_incident_id: string;
  is_read: boolean;
  created_at: Date;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  constructor(private httpService: HttpService) {}

  getNotifications(): Observable<Notification[]> {
    return this.httpService.get<Notification[]>('/notifications');
  }

  markAsRead(id: string): Observable<Notification> {
    return this.httpService.patch<Notification>(`/notifications/${id}/read`, {});
  }
}
