import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { HttpService } from './http.service';
import {
  ActivityItem,
  ActivityRow,
  IncidentStats,
  WeeklyStats,
} from '../models/dashboard.model';

/**
 * Servicio del Dashboard — F6 redesign
 * (`2026-09-08-f6-dashboard-redesign`).
 *
 * El backend (`backend/src/modules/incidents/`) expone tres
 * endpoints que el dashboard consume. Esta capa es la única que
 * los conoce: si cambian las URLs o los campos, la diferencia
 * queda contenida acá.
 *
 * Decisión de diseño (D2 del change): los **nombres de campo del
 * wire** se respetan en el modelo (`snake_case`) — la
 * `SnakeCaseResponseInterceptor` ya hace la traducción en el
 * backend, y mantener el casing evita errores de mapeo silenciosos
 * (precedente SC-209, `size_bytes` vs `file_size`).
 *
 * Endpoints consumidos (F6.4.1 inventario):
 *  - `GET /api/incidents/stats`         → `IncidentStats`
 *  - `GET /api/incidents/weekly-stats`  → `WeeklyStats`
 *  - `GET /api/incidents/feed?limit=5`  → `ActivityItem[]`
 */
@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly http = inject(HttpService);

  getStats(): Observable<IncidentStats> {
    return this.http.get<IncidentStats>('/incidents/stats');
  }

  getWeeklyStats(): Observable<WeeklyStats> {
    return this.http.get<WeeklyStats>('/incidents/weekly-stats');
  }

  /**
   * Actividad reciente — el feed completo de incidencias
   * paginado. Tomamos `limit=5` que es lo que el mock 01-01
   * muestra ("Máx 4-5 rows visible"). Si el feed no existe o
   * la respuesta es inesperada, devolvemos lista vacía para que
   * el bloque pinte su estado vacío (D5/D7).
   */
  getRecentActivity(limit = 5): Observable<ActivityRow[]> {
    return this.http
      .get<{ data?: ActivityItem[] }>('/incidents/feed', { limit })
      .pipe(
        map((response) => {
          const data = response?.data ?? [];
          return data.slice(0, limit).map((item) => ({
            id: item.id,
            category: item.category?.name ?? '—',
            status: item.status,
            priority: item.priority,
            createdAt: item.created_at,
          }));
        }),
      );
  }
}
