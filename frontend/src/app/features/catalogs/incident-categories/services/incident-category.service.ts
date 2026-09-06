import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '../../../../core/services/http.service';
import {
  IIncidentCategory,
  IIncidentCategoryListParams,
  IIncidentCategoryListResult,
  ICreateIncidentCategoryDto,
  IUpdateIncidentCategoryDto,
} from '../interfaces/iincident-category.interface';

const ENDPOINT = '/incident-categories';

@Injectable({ providedIn: 'root' })
export class IncidentCategoryService {
  private readonly http = inject(HttpService);

  list(params: IIncidentCategoryListParams = {}): Observable<IIncidentCategoryListResult> {
    return this.http.get<IIncidentCategoryListResult>(ENDPOINT, params);
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
