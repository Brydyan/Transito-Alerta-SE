import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '../../../../core/services/http.service';
import {
  IIncidentCategory,
  IIncidentCategoryListParams,
  IIncidentCategoryListResult,
  ICreateIncidentCategoryDto,
  IUpdateIncidentCategoryDto,
  IncidentCategoryTreeNode,
} from '../interfaces/iincident-category.interface';

const ENDPOINT = '/incident-categories';
/** Matches the backend `MAX_PAGE_SIZE` constant (incident-categories.service.ts). */
const HARD_PAGE_LIMIT = 100;

@Injectable({ providedIn: 'root' })
export class IncidentCategoryService {
  private readonly http = inject(HttpService);

  /** Returns the full hierarchy from the backend. */
  getTree(): Observable<IncidentCategoryTreeNode[]> {
    return this.http.get<IncidentCategoryTreeNode[]>(`${ENDPOINT}/tree`);
  }

  list(params: IIncidentCategoryListParams = {}): Observable<IIncidentCategoryListResult> {
    return this.http.get<IIncidentCategoryListResult>(ENDPOINT, params);
  }

  /**
   * Returns the FULL flat list of categories (T7.4). The admin list
   * builds a client-side tree from this and renders it with chevron
   * expand/collapse — pagination doesn't fit that UX.
   *
   * Asks the backend for the page-size cap (100) in one request. The
   * realistic catalog size is well under 100 entries; if the catalog
   * ever grows past that we'd add a multi-page loop here (mirroring
   * `GeoZoneService.listAll()`). For now this stays a one-shot.
   */
  listAll(): Observable<IIncidentCategory[]> {
    return new Observable((subscriber) => {
      this.list({ page: 1, per_page: HARD_PAGE_LIMIT }).subscribe({
        next: (result) => {
          subscriber.next(result.items);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  getById(id: string): Observable<IIncidentCategory> {
    return this.http.get<IIncidentCategory>(`${ENDPOINT}/${id}`);
  }

  create(dto: ICreateIncidentCategoryDto): Observable<IIncidentCategory> {
    return this.http.post<IIncidentCategory>(ENDPOINT, dto);
  }

  update(id: string, dto: IUpdateIncidentCategoryDto): Observable<IIncidentCategory> {
    return this.http.patch<IIncidentCategory>(`${ENDPOINT}/${id}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${ENDPOINT}/${id}`);
  }
}
