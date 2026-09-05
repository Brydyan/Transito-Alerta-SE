import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '../../../../core/services/http.service';
import {
  IOrganization,
  IOrganizationListParams,
  IOrganizationListResult,
  ICreateOrganizationDto,
  IUpdateOrganizationDto,
} from '../interfaces/iorganization.interface';

const ENDPOINT = '/organizations';

@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private readonly http = inject(HttpService);

  list(params: IOrganizationListParams = {}): Observable<IOrganizationListResult> {
    return this.http.get<IOrganizationListResult>(ENDPOINT, params);
  }

  getById(id: string): Observable<IOrganization> {
    return this.http.get<IOrganization>(`${ENDPOINT}/${id}`);
  }

  create(dto: ICreateOrganizationDto): Observable<IOrganization> {
    return this.http.post<IOrganization>(ENDPOINT, dto);
  }

  update(id: string, dto: IUpdateOrganizationDto): Observable<IOrganization> {
    return this.http.patch<IOrganization>(`${ENDPOINT}/${id}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${ENDPOINT}/${id}`);
  }
}
