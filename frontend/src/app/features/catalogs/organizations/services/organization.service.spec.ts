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
            updated_at: '2026-09-01T00:00:00Z',
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
        updated_at: 'now',
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
});
