import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { HttpService } from '../../../../core/services/http.service';
import {
  IGeoZone,
  IGeoZoneListParams,
  IGeoZoneListResult,
  ICreateGeoZoneDto,
  IUpdateGeoZoneDto,
} from '../interfaces/igeo-zone.interface';

const ENDPOINT = '/geo-zones';

/**
 * GeoZoneService — F2.3 Ubicaciones.
 *
 * The tree screen uses `listAll()` to fetch the FULL flat list (a single
 * page with a very large `per_page`) and builds the tree client-side in one
 * pass (design D3). Paged access is available via `list()` for other uses.
 */
@Injectable({ providedIn: 'root' })
export class GeoZoneService {
  private readonly http = inject(HttpService);

  list(params: IGeoZoneListParams = {}): Observable<IGeoZoneListResult> {
    return this.http.get<IGeoZoneListResult>(ENDPOINT, params);
  }

  /** Fetch the full flat list for client-side tree building (D3). */
  listAll(): Observable<IGeoZone[]> {
    return this.http
      .get<IGeoZoneListResult>(ENDPOINT, { per_page: 10000 })
      .pipe(map((result) => result.items));
  }

  getById(id: string): Observable<IGeoZone> {
    return this.http.get<IGeoZone>(`${ENDPOINT}/${id}`);
  }

  create(dto: ICreateGeoZoneDto): Observable<IGeoZone> {
    return this.http.post<IGeoZone>(ENDPOINT, dto);
  }

  update(id: string, dto: IUpdateGeoZoneDto): Observable<IGeoZone> {
    return this.http.patch<IGeoZone>(`${ENDPOINT}/${id}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${ENDPOINT}/${id}`);
  }
}
