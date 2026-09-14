import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from './http.service';

export interface CorroborationPayload {
  comment: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class IncidentSocialService {
  constructor(private httpService: HttpService) {}

  follow(incidentId: string): Observable<void> {
    return this.httpService.post<void>(`/incidents/${incidentId}/followers`, {});
  }

  unfollow(incidentId: string): Observable<void> {
    return this.httpService.delete<void>(`/incidents/${incidentId}/followers`);
  }

  corroborate(incidentId: string, comment: string | null = null): Observable<void> {
    return this.httpService.post<void>(`/incidents/${incidentId}/corroborations`, { comment });
  }
}
