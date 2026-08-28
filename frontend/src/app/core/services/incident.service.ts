import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpService } from './http.service';
import { Incident, CreateIncidentDto } from '../models/incident.model';

@Injectable({
  providedIn: 'root',
})
export class IncidentService {
  private incidents$ = new BehaviorSubject<Incident[]>([]);

  constructor(private httpService: HttpService) {}

  getIncidents(filters?: any): Observable<Incident[]> {
    return new Observable(observer => {
      this.httpService.get<Incident[]>('/incidents', filters).subscribe({
        next: (data) => {
          this.incidents$.next(data);
          observer.next(data);
          observer.complete();
        },
        error: (error) => observer.error(error),
      });
    });
  }

  getIncident(id: string): Observable<Incident> {
    return this.httpService.get<Incident>(`/incidents/${id}`);
  }

  createIncident(dto: CreateIncidentDto): Observable<Incident> {
    return new Observable(observer => {
      this.httpService.post<Incident>('/incidents', dto).subscribe({
        next: (incident) => {
          const current = this.incidents$.value;
          this.incidents$.next([incident, ...current]);
          observer.next(incident);
          observer.complete();
        },
        error: (error) => observer.error(error),
      });
    });
  }

  updateIncidentStatus(id: string, status: string): Observable<Incident> {
    return new Observable(observer => {
      this.httpService
        .patch<Incident>(`/incidents/${id}/status`, { status })
        .subscribe({
          next: (incident) => {
            const current = this.incidents$.value.map(inc =>
              inc.id === id ? incident : inc,
            );
            this.incidents$.next(current);
            observer.next(incident);
            observer.complete();
          },
          error: (error) => observer.error(error),
        });
    });
  }

  deleteIncident(id: string): Observable<void> {
    return new Observable(observer => {
      this.httpService.delete<void>(`/incidents/${id}`).subscribe({
        next: () => {
          const current = this.incidents$.value.filter(inc => inc.id !== id);
          this.incidents$.next(current);
          observer.next();
          observer.complete();
        },
        error: (error) => observer.error(error),
      });
    });
  }

  getIncidents$(): Observable<Incident[]> {
    return this.incidents$.asObservable();
  }
}
