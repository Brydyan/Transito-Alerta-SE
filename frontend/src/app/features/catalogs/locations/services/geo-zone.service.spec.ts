import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { GeoZoneService } from './geo-zone.service';
import { HttpService } from '../../../../core/services/http.service';
import { IGeoZone } from '../interfaces/igeo-zone.interface';

/**
 * F2.3.2 — specs for `GeoZoneService`.
 *
 * The pagination tests exist because `listAll()` used to ask for
 * `per_page: 10000` while the backend clamps every page to
 * `MAX_PAGE_SIZE = 100` (`geo-zones.repository.ts`
 * `Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)`).
 * The request succeeded and quietly returned the first 100 rows, and
 * `buildTree` then promoted every child whose parent fell outside that
 * window to a root — a silently wrong hierarchy with no error anywhere.
 */
describe('GeoZoneService', () => {
  let service: GeoZoneService;
  let httpMock: {
    get: jest.Mock;
    post: jest.Mock;
    patch: jest.Mock;
    delete: jest.Mock;
  };

  const zone = (id: string, overrides: Partial<IGeoZone> = {}): IGeoZone => ({
    id,
    name: `Zone ${id}`,
    code: null,
    level: 'parroquia',
    parent_id: null,
    active: true,
    created_at: '2026-09-01T00:00:00Z',
    ...overrides,
  });

  /** Builds `count` zones named by their absolute index. */
  const page = (from: number, count: number): IGeoZone[] =>
    Array.from({ length: count }, (_, i) => zone(String(from + i)));

  beforeEach(() => {
    httpMock = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [GeoZoneService, { provide: HttpService, useValue: httpMock }],
    });

    service = TestBed.inject(GeoZoneService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listAll', () => {
    it('never asks for a page larger than the backend MAX_PAGE_SIZE (100)', (done) => {
      httpMock.get.mockReturnValue(of({ items: page(1, 3), total: 3 }));

      service.listAll().subscribe(() => {
        for (const call of httpMock.get.mock.calls) {
          expect(call[1].per_page).toBeLessThanOrEqual(100);
        }
        done();
      });
    });

    it('issues a single request when the catalog fits in one page', (done) => {
      httpMock.get.mockReturnValue(of({ items: page(1, 26), total: 26 }));

      service.listAll().subscribe((items) => {
        expect(httpMock.get).toHaveBeenCalledTimes(1);
        expect(httpMock.get).toHaveBeenCalledWith('/geo-zones', {
          page: 1,
          per_page: 100,
        });
        expect(items).toHaveLength(26);
        done();
      });
    });

    it('pages through the whole catalog when total exceeds one page', (done) => {
      httpMock.get
        .mockReturnValueOnce(of({ items: page(1, 100), total: 250 }))
        .mockReturnValueOnce(of({ items: page(101, 100), total: 250 }))
        .mockReturnValueOnce(of({ items: page(201, 50), total: 250 }));

      service.listAll().subscribe((items) => {
        expect(httpMock.get).toHaveBeenCalledTimes(3);
        expect(httpMock.get).toHaveBeenNthCalledWith(1, '/geo-zones', {
          page: 1,
          per_page: 100,
        });
        expect(httpMock.get).toHaveBeenNthCalledWith(2, '/geo-zones', {
          page: 2,
          per_page: 100,
        });
        expect(httpMock.get).toHaveBeenNthCalledWith(3, '/geo-zones', {
          page: 3,
          per_page: 100,
        });

        // The regression this suite exists for: all 250 rows, not the first 100.
        expect(items).toHaveLength(250);
        done();
      });
    });

    it('preserves backend order across page boundaries', (done) => {
      httpMock.get
        .mockReturnValueOnce(of({ items: page(1, 100), total: 150 }))
        .mockReturnValueOnce(of({ items: page(101, 50), total: 150 }));

      service.listAll().subscribe((items) => {
        expect(items[0].id).toBe('1');
        expect(items[99].id).toBe('100');
        expect(items[100].id).toBe('101');
        expect(items[149].id).toBe('150');
        done();
      });
    });

    it('returns an empty array for an empty catalog without looping', (done) => {
      httpMock.get.mockReturnValue(of({ items: [], total: 0 }));

      service.listAll().subscribe((items) => {
        expect(items).toEqual([]);
        expect(httpMock.get).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('stops when a page comes back empty even if total disagrees', (done) => {
      // Defensive: a stale/incorrect `total` must not spin forever.
      httpMock.get
        .mockReturnValueOnce(of({ items: page(1, 100), total: 9999 }))
        .mockReturnValueOnce(of({ items: [], total: 9999 }));

      service.listAll().subscribe((items) => {
        expect(httpMock.get).toHaveBeenCalledTimes(2);
        expect(items).toHaveLength(100);
        done();
      });
    });
  });

  describe('list', () => {
    it('forwards search and pagination params and returns wire fields', (done) => {
      const mockResult = {
        items: [
          zone('1', { name: 'Santa Elena', code: 'SE', level: 'provincia' }),
        ],
        total: 1,
      };
      httpMock.get.mockReturnValue(of(mockResult));

      service.list({ search: 'Santa', page: 2, per_page: 20 }).subscribe((res) => {
        expect(httpMock.get).toHaveBeenCalledWith('/geo-zones', {
          search: 'Santa',
          page: 2,
          per_page: 20,
        });
        expect(res.items[0].id).toBe('1');
        expect(res.items[0].name).toBe('Santa Elena');
        expect(res.items[0].code).toBe('SE');
        expect(res.items[0].level).toBe('provincia');
        expect(res.items[0].parent_id).toBeNull();
        expect(res.items[0].active).toBe(true);
        expect(res.items[0].created_at).toBe('2026-09-01T00:00:00Z');
        done();
      });
    });
  });

  describe('getById', () => {
    it('fetches a zone by id', (done) => {
      httpMock.get.mockReturnValue(of(zone('7')));
      service.getById('7').subscribe((res) => {
        expect(httpMock.get).toHaveBeenCalledWith('/geo-zones/7');
        expect(res.id).toBe('7');
        done();
      });
    });
  });

  describe('create', () => {
    it('sends the dto through', (done) => {
      const dto = {
        name: 'Nueva',
        polygon: { type: 'Polygon' as const, coordinates: [] },
      };
      httpMock.post.mockReturnValue(of(zone('9', { name: 'Nueva' })));

      service.create(dto).subscribe((res) => {
        expect(httpMock.post).toHaveBeenCalledWith('/geo-zones', dto);
        expect(res.name).toBe('Nueva');
        done();
      });
    });
  });

  describe('update', () => {
    it('patches the zone', (done) => {
      httpMock.patch.mockReturnValue(of(zone('1', { name: 'Editada' })));
      service.update('1', { name: 'Editada' }).subscribe((res) => {
        expect(httpMock.patch).toHaveBeenCalledWith('/geo-zones/1', {
          name: 'Editada',
        });
        expect(res.name).toBe('Editada');
        done();
      });
    });
  });

  describe('remove', () => {
    it('deletes the zone', (done) => {
      httpMock.delete.mockReturnValue(of(undefined));
      service.remove('1').subscribe(() => {
        expect(httpMock.delete).toHaveBeenCalledWith('/geo-zones/1');
        done();
      });
    });
  });

  // ── sc-334 Phase 2 — importShapefile + getFormData ──────────────────

  describe('importShapefile (sc-334)', () => {
    /**
     * The import endpoint requires progress events so the dialog can render
     * an upload bar. `HttpService.post` does not support multipart or
     * `reportProgress`, so the service falls back to `HttpClient` for this
     * single call (design D2 + D4).
     */
    let httpClientMock: { post: jest.Mock };

    beforeEach(() => {
      httpClientMock = { post: jest.fn() };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          GeoZoneService,
          { provide: HttpService, useValue: httpMock },
          { provide: HttpClient, useValue: httpClientMock },
        ],
      });
      service = TestBed.inject(GeoZoneService);
    });

    it('POSTs the file as multipart/form-data under field name "file"', () => {
      httpClientMock.post.mockReturnValue(of({ type: HttpEventType.Response }));

      const file = new File(['zipbytes'], 'cantons.zip', { type: 'application/zip' });
      service.importShapefile(file, {
        level: 'canton',
        auto_parent: false,
        name_column: 'NAME',
        code_column: 'CODE',
      }).subscribe();

      expect(httpClientMock.post).toHaveBeenCalledTimes(1);
      const [url, body, options] = httpClientMock.post.mock.calls[0];
      expect(url).toBe('/api/geo-zones/import');
      expect(body).toBeInstanceOf(FormData);
      const formData = body as FormData;
      expect(formData.get('file')).toBe(file);
      // Query params land as `options.params` (HttpParams)
      expect(options.reportProgress).toBe(true);
      expect(options.observe).toBe('events');
    });

    it('forwards level, auto_parent, name_column, code_column as query params', () => {
      httpClientMock.post.mockReturnValue(of({ type: HttpEventType.Response }));

      const file = new File(['zip'], 'a.zip', { type: 'application/zip' });
      service.importShapefile(file, {
        level: 'parroquia',
        auto_parent: true,
        name_column: 'NOMBRE',
        code_column: 'CODIGO',
      }).subscribe();

      const [, , options] = httpClientMock.post.mock.calls[0];
      const params = options.params as { get: (k: string) => string };
      expect(params.get('level')).toBe('parroquia');
      expect(params.get('auto_parent')).toBe('true');
      expect(params.get('name_column')).toBe('NOMBRE');
      expect(params.get('code_column')).toBe('CODIGO');
    });

    it('emits UploadProgress events through the returned Observable', (done) => {
      const progressEvent: HttpEvent<unknown> = {
        type: HttpEventType.UploadProgress,
        loaded: 50,
        total: 100,
      };
      const responseEvent: HttpEvent<unknown> = {
        type: HttpEventType.Response,
        body: { imported: 3, skipped: 0, errors: [], warnings: [] },
      } as HttpResponse<unknown>;
      httpClientMock.post.mockReturnValue(of(progressEvent, responseEvent));

      const file = new File(['x'], 'a.zip', { type: 'application/zip' });
      const events: HttpEvent<unknown>[] = [];
      service.importShapefile(file, {
        level: 'canton',
        auto_parent: false,
        name_column: 'NAME',
        code_column: 'CODE',
      }).subscribe((event) => {
        events.push(event);
        if (events.length === 2) {
          expect(events[0].type).toBe(HttpEventType.UploadProgress);
          expect((events[0] as { loaded: number }).loaded).toBe(50);
          expect(events[1].type).toBe(HttpEventType.Response);
          done();
        }
      });
    });
  });

  describe('getFormData (sc-334)', () => {
    it('GETs /geo-zones/form-data and returns the levels + parents envelope', (done) => {
      const envelope = {
        levels: ['cantón', 'parroquia', 'provincia', 'sector'],
        parents: [
          { id: 'p1', name: 'Pichincha', code: 'EC-17', level: 'provincia' as const },
        ],
      };
      httpMock.get.mockReturnValue(of(envelope));

      service.getFormData().subscribe((result) => {
        expect(httpMock.get).toHaveBeenCalledWith('/geo-zones/form-data');
        expect(result.levels).toHaveLength(4);
        expect(result.parents[0].name).toBe('Pichincha');
        expect(result.parents[0].level).toBe('provincia');
        done();
      });
    });
  });
});
