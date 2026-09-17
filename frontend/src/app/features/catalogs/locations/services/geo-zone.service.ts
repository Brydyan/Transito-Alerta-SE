import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { EMPTY, Observable, expand, reduce } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { HttpService } from '../../../../core/services/http.service';
import {
  IGeoZone,
  IGeoZoneListParams,
  IGeoZoneListResult,
  ICreateGeoZoneDto,
  IUpdateGeoZoneDto,
  IImportGeoZoneResponse,
  IGeoZoneFormData,
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
  private readonly httpClient = inject(HttpClient);

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

  /**
   * sc-334 R7/D2 — bulk shapefile import.
   *
   * POST `multipart/form-data` with the `.zip` under field name `file`.
   * `reportProgress: true` + `observe: 'events'` so the dialog can render
   * an upload progress bar (`HttpEventType.UploadProgress`) and consume
   * the final envelope (`HttpEventType.Response`).
   *
   * Query params carry `level` (required), `auto_parent` (default true),
   * `name_column` (default `NAME`), `code_column` (default `CODE`) —
   * the backend DTO `ImportGeoZoneQueryDto` validates them. We bypass
   * `HttpService.post` because that helper does not support multipart
   * bodies or progress events; the import endpoint is the only call in
   * the catalog that needs them.
   */
  importShapefile(
    file: File,
    params: {
      level: 'provincia' | 'canton' | 'parroquia' | 'zona';
      auto_parent: boolean;
      name_column: string;
      code_column: string;
    },
  ): Observable<HttpEvent<IImportGeoZoneResponse>> {
    const formData = new FormData();
    formData.append('file', file);

    let httpParams = new HttpParams();
    httpParams = httpParams.set('level', params.level);
    httpParams = httpParams.set('auto_parent', String(params.auto_parent));
    httpParams = httpParams.set('name_column', params.name_column);
    httpParams = httpParams.set('code_column', params.code_column);

    return this.httpClient.post<IImportGeoZoneResponse>(
      `${environment.apiUrl}${ENDPOINT}/import`,
      formData,
      {
        reportProgress: true,
        observe: 'events',
        params: httpParams,
      },
    );
  }

  /**
   * sc-334 R9 — form-data lookup.
   *
   * Returns the static 4-level array + the active parent zone list. Used
   * by the import dialog to populate the level dropdown and (later) the
   * parent selector. Wraps `HttpService.get` so the URL is centralized
   * like every other read.
   */
  getFormData(): Observable<IGeoZoneFormData> {
    return this.http.get<IGeoZoneFormData>(`${ENDPOINT}/form-data`);
  }
}
