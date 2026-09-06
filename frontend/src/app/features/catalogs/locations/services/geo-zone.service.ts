import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, reduce } from 'rxjs';
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
 * The backend clamps every page to `MAX_PAGE_SIZE = 100`
 * (`geo-zones.repository.ts`: `Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE,
 * MAX_PAGE_SIZE)`), so asking for more is silently downgraded. Request
 * exactly the ceiling and page through the rest.
 */
const MAX_PAGE_SIZE = 100;

/**
 * GeoZoneService — F2.3 Ubicaciones.
 *
 * The tree screen uses `listAll()` to fetch the FULL flat list and builds the
 * tree client-side (design D3). Paged access is available via `list()`.
 */
@Injectable({ providedIn: 'root' })
export class GeoZoneService {
  private readonly http = inject(HttpService);

  list(params: IGeoZoneListParams = {}): Observable<IGeoZoneListResult> {
    return this.http.get<IGeoZoneListResult>(ENDPOINT, params);
  }

  /**
   * Fetch the full flat list for client-side tree building (D3).
   *
   * Pages through the catalog instead of asking for one huge page: the
   * backend caps `per_page` at 100 and returns the first 100 rows with a
   * 200, so a single oversized request looks successful while silently
   * truncating. That truncation is not merely "missing rows" — `buildTree`
   * promotes every node whose parent fell outside the window to a root, so
   * the tree renders a wrong hierarchy with no error. `total` from the first
   * response drives how many more pages are needed.
   */
  listAll(): Observable<IGeoZone[]> {
    return this.fetchPage(1).pipe(
      expand((result, index) => {
        const fetched = (index + 1) * MAX_PAGE_SIZE;
        // `items.length === 0` guards against a stale/incorrect `total`
        // turning this into an endless request loop.
        return result.items.length > 0 && fetched < result.total
          ? this.fetchPage(index + 2)
          : EMPTY;
      }),
      reduce((acc: IGeoZone[], result) => acc.concat(result.items), []),
    );
  }

  private fetchPage(page: number): Observable<IGeoZoneListResult> {
    return this.http.get<IGeoZoneListResult>(ENDPOINT, {
      page,
      per_page: MAX_PAGE_SIZE,
    });
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
