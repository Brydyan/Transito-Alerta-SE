import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { IncidentImage } from '../models/incident.model';

@Injectable({ providedIn: 'root' })
export class IncidentUploadService {
  constructor(private http: HttpClient) {}

  uploadImages(incidentId: string, files: Blob[]): Observable<IncidentImage[]> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('images', file);
    });
    return this.http.post<IncidentImage[]>(`${environment.apiUrl}/incidents/${incidentId}/images`, formData);
  }
}
