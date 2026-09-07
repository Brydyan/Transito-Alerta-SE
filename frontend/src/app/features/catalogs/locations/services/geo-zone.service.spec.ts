import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
});
