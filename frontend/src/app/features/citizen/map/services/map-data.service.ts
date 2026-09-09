import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '../../../../core/services/http.service';
import { Incident } from '../../../../core/models/incident.model';

export interface MapFiltersResponse {
  data: {
    categories: { id: string; name: string }[];
  };
}

export interface FeedResponse {
  data: Incident[];
  meta?: {
    page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class MapDataService {
  private readonly http = inject(HttpService);

  getMapFilters(): Observable<MapFiltersResponse> {
    return this.http.get<MapFiltersResponse>('/map/filters');
  }

  getIncidentsFeed(filters: Record<string, string | number>): Observable<FeedResponse> {
    return this.http.get<FeedResponse>('/incidents/feed', filters);
  }
}
