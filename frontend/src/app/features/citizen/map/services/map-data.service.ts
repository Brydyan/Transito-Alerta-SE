import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '../../../../core/services/http.service';
import { IncidentFeedResponse } from '../../../../core/models/incident.model';

export interface MapFiltersResponse {
  data: {
    categories: { id: string; name: string }[];
  };
}

export interface MapActiveFilters {
  status?: string;
  priority?: string;
  incident_category_id?: string;
}

// FIX-07: single source of truth for the feed envelope lives in
// core/models/incident.model.ts (IncidentFeedResponse). Re-exported here
// for backwards compatibility with existing imports.
export type { IncidentFeedResponse as FeedResponse } from '../../../../core/models/incident.model';

@Injectable({
  providedIn: 'root'
})
export class MapDataService {
  private readonly http = inject(HttpService);

  getMapFilters(): Observable<MapFiltersResponse> {
    return this.http.get<MapFiltersResponse>('/map/filters');
  }

  getIncidentsFeed(filters: MapActiveFilters): Observable<IncidentFeedResponse> {
    return this.http.get<IncidentFeedResponse>('/incidents/feed', filters as Record<string, string>);
  }
}
