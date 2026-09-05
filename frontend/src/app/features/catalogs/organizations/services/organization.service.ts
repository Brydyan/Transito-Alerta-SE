import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, reduce } from 'rxjs';
import { HttpService } from '../../../../core/services/http.service';
import {
  IOrganization,
  IOrganizationListParams,
  IOrganizationListResult,
  IOrganizationFormData,
  ICreateOrganizationDto,
  IUpdateOrganizationDto,
} from '../interfaces/iorganization.interface';

const ENDPOINT = '/organizations';

/**
 * `organizations.repository.ts` clava `MAX_PAGE_SIZE = 100` igual que
 * `geo-zones`: pedir más se degrada en silencio a 100.
 */
const MAX_PAGE_SIZE = 100;

@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private readonly http = inject(HttpService);

  list(params: IOrganizationListParams = {}): Observable<IOrganizationListResult> {
    return this.http.get<IOrganizationListResult>(ENDPOINT, params);
  }

  /**
   * Catálogo completo, paginando hasta agotar `total`. Las tarjetas de
   * resumen del mock 08-01 («ciudades alcanzadas», «nuevas este mes») se
   * calculan sobre todas las organizaciones, no sobre la página visible.
   */
  listAll(): Observable<IOrganization[]> {
    return this.fetchPage(1).pipe(
      expand((result, index) => {
        const fetched = (index + 1) * MAX_PAGE_SIZE;
        return result.items.length > 0 && fetched < result.total
          ? this.fetchPage(index + 2)
          : EMPTY;
      }),
      reduce((acc: IOrganization[], result) => acc.concat(result.items), []),
    );
  }

  /** Zonas y roles para los selectores del formulario. */
  formData(): Observable<IOrganizationFormData> {
    return this.http.get<IOrganizationFormData>(`${ENDPOINT}/form-data`);
  }

  private fetchPage(page: number): Observable<IOrganizationListResult> {
    return this.http.get<IOrganizationListResult>(ENDPOINT, {
      page,
      per_page: MAX_PAGE_SIZE,
    });
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
