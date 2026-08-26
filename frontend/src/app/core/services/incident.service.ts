import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class IncidentService {
  constructor(private http: HttpClient) {}

  createIncident(data: any): Observable<any> {
    return this.http.post('/api/incidents', data);
  }
}
