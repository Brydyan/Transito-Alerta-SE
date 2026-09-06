import { TestBed } from '@angular/core/testing';
import { OrganizationService } from './organization.service';
import { HttpService } from '../../../../core/services/http.service';
import { of } from 'rxjs';

describe('OrganizationService', () => {
  let service: OrganizationService;
  let httpMock: any;

  beforeEach(() => {
    httpMock = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [OrganizationService, { provide: HttpService, useValue: httpMock }],
    });

    service = TestBed.inject(OrganizationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('list', () => {
    it('should map search and pagination params correctly and return matching fields', (done) => {
      const mockResult = {
        items: [
          {
            id: '1',
            name: 'Police',
            zone_id: null,
            parent_id: null,
            incident_category_id: null,
            max_active_claims: 10,
            created_at: '2026-09-01T00:00:00Z',
          },
        ],
        total: 1,
      };
      httpMock.get.mockReturnValue(of(mockResult));

      service.list({ search: 'Police', page: 2, per_page: 20 }).subscribe((res) => {
        expect(httpMock.get).toHaveBeenCalledWith('/organizations', {
          search: 'Police',
          page: 2,
          per_page: 20,
        });

        // Asserting on fields exactly as required by the task F2.2.3
        expect(res.items.length).toBe(1);
        expect(res.items[0].id).toBe('1');
        expect(res.items[0].name).toBe('Police');
        expect(res.items[0].zone_id).toBeNull();
        expect(res.items[0].max_active_claims).toBe(10);
        expect(res.items[0].created_at).toBe('2026-09-01T00:00:00Z');

        done();
      });
    });
  });

  describe('create', () => {
    it('should send the dto and return an organization mapping', (done) => {
      const dto = { name: 'Fire Department' };
      const mockResult = {
        id: '2',
        ...dto,
        max_active_claims: 0,
        created_at: 'now',
      };
      httpMock.post.mockReturnValue(of(mockResult));

      service.create(dto).subscribe((res) => {
        expect(httpMock.post).toHaveBeenCalledWith('/organizations', dto);
        expect(res.name).toBe('Fire Department');
        done();
      });
    });
  });

  describe('getById', () => {
    it('should fetch organization by id', (done) => {
      httpMock.get.mockReturnValue(of({ id: '1', name: 'Org1' }));
      service.getById('1').subscribe((res) => {
        expect(httpMock.get).toHaveBeenCalledWith('/organizations/1');
        expect(res.name).toBe('Org1');
        done();
      });
    });
  });

  describe('update', () => {
    it('should update organization', (done) => {
      httpMock.patch.mockReturnValue(of({ id: '1', name: 'Org Updated' }));
      service.update('1', { name: 'Org Updated' }).subscribe((res) => {
        expect(httpMock.patch).toHaveBeenCalledWith('/organizations/1', { name: 'Org Updated' });
        expect(res.name).toBe('Org Updated');
        done();
      });
    });
  });

  describe('remove', () => {
    it('should delete organization', (done) => {
      httpMock.delete.mockReturnValue(of(undefined));
      service.remove('1').subscribe(() => {
        expect(httpMock.delete).toHaveBeenCalledWith('/organizations/1');
        done();
      });
    });
  });

  /**
   * F2.5.7 — `zone_id` es lo que dirige el ruteo de incidencias a
   * organizaciones. El DTO del frontend mandaba sólo `name`, así que la UI
   * descartaba en silencio un campo que el backend acepta y que el mock 08-01
   * muestra como columna «LOCALIZACIÓN».
   */
  describe('zone_id y parent_id', () => {
    it('envía zone_id y parent_id al crear', (done) => {
      const dto = { name: 'GAD Quito', zone_id: 'z-1', parent_id: null };
      httpMock.post.mockReturnValue(
        of({ id: '9', name: 'GAD Quito', zone_id: 'z-1', parent_id: null }),
      );

      service.create(dto).subscribe((res) => {
        expect(httpMock.post).toHaveBeenCalledWith('/organizations', dto);
        expect(res.zone_id).toBe('z-1');
        done();
      });
    });

    it('permite desvincular la zona mandando null explícito', (done) => {
      httpMock.patch.mockReturnValue(of({ id: '1', name: 'X', zone_id: null }));

      service.update('1', { zone_id: null }).subscribe(() => {
        expect(httpMock.patch).toHaveBeenCalledWith('/organizations/1', {
          zone_id: null,
        });
        done();
      });
    });

    it('lee zone_id y parent_id del wire en el listado', (done) => {
      httpMock.get.mockReturnValue(
        of({
          items: [
            {
              id: '1',
              name: 'GAD Quito – Zona Centro',
              zone_id: 'z-quito',
              parent_id: 'org-quito',
              incident_category_id: null,
              max_active_claims: 5,
              created_at: '2026-07-22T00:00:00Z',
            },
          ],
          total: 1,
        }),
      );

      service.list().subscribe((res) => {
        expect(res.items[0].zone_id).toBe('z-quito');
        expect(res.items[0].parent_id).toBe('org-quito');
        done();
      });
    });
  });

  describe('formData', () => {
    it('lee geo_zones en snake_case, como las emite el interceptor', (done) => {
      // El backend declara `geoZones`, pero SnakeCaseResponseInterceptor
      // reescribe toda clave de toda respuesta (design D2).
      httpMock.get.mockReturnValue(
        of({
          roles: [{ id: 'r1', name: 'admin_global' }],
          geo_zones: [{ id: 'z-1', name: 'Quito' }],
        }),
      );

      service.formData().subscribe((res) => {
        expect(httpMock.get).toHaveBeenCalledWith('/organizations/form-data');
        expect(res.geo_zones).toHaveLength(1);
        expect(res.geo_zones[0].name).toBe('Quito');
        done();
      });
    });
  });

  /**
   * Mismo tope que geo-zones: `organizations.repository.ts` clava
   * `MAX_PAGE_SIZE = 100`. Las tarjetas de resumen del mock 08-01
   * («ciudades alcanzadas», «nuevas este mes») necesitan el catálogo
   * completo, no la página visible.
   */
  describe('listAll', () => {
    const orgs = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: String(from + i),
        name: `Org ${from + i}`,
        zone_id: null,
        parent_id: null,
        incident_category_id: null,
        max_active_claims: 0,
        created_at: '2026-07-22T00:00:00Z',
      }));

    it('trae una sola página cuando el catálogo entra en ella', (done) => {
      httpMock.get.mockReturnValue(of({ items: orgs(1, 11), total: 11 }));

      service.listAll().subscribe((items) => {
        expect(httpMock.get).toHaveBeenCalledTimes(1);
        expect(httpMock.get).toHaveBeenCalledWith('/organizations', {
          page: 1,
          per_page: 100,
        });
        expect(items).toHaveLength(11);
        done();
      });
    });

    it('pagina hasta traer el catálogo entero', (done) => {
      httpMock.get
        .mockReturnValueOnce(of({ items: orgs(1, 100), total: 130 }))
        .mockReturnValueOnce(of({ items: orgs(101, 30), total: 130 }));

      service.listAll().subscribe((items) => {
        expect(httpMock.get).toHaveBeenCalledTimes(2);
        expect(items).toHaveLength(130);
        expect(items[129].id).toBe('130');
        done();
      });
    });

    it('corta si una página vuelve vacía aunque total diga otra cosa', (done) => {
      httpMock.get
        .mockReturnValueOnce(of({ items: orgs(1, 100), total: 9999 }))
        .mockReturnValueOnce(of({ items: [], total: 9999 }));

      service.listAll().subscribe((items) => {
        expect(httpMock.get).toHaveBeenCalledTimes(2);
        expect(items).toHaveLength(100);
        done();
      });
    });
  });
});
