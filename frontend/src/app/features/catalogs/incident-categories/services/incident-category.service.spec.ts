import { TestBed } from '@angular/core/testing';
import { IncidentCategoryService } from './incident-category.service';
import { HttpService } from '../../../../core/services/http.service';
import { of } from 'rxjs';

describe('IncidentCategoryService', () => {
  let service: IncidentCategoryService;
  let httpMock: any;

  beforeEach(() => {
    httpMock = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        IncidentCategoryService,
        { provide: HttpService, useValue: httpMock }
      ]
    });

    service = TestBed.inject(IncidentCategoryService);
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
            name: 'Crash',
            parent_id: null,
            created_at: '2026-09-01T00:00:00Z',
            updated_at: '2026-09-01T00:00:00Z'
          }
        ],
        total: 1
      };
      httpMock.get.mockReturnValue(of(mockResult));

      service.list({ search: 'Crash', page: 2, per_page: 20 }).subscribe((res) => {
        expect(httpMock.get).toHaveBeenCalledWith('/incident-categories', { search: 'Crash', page: 2, per_page: 20 });

        // Asserting on fields exactly as required by the task F2.1.3
        expect(res.items.length).toBe(1);
        expect(res.items[0].id).toBe('1');
        expect(res.items[0].name).toBe('Crash');
        expect(res.items[0].parent_id).toBeNull();
        expect(res.items[0].created_at).toBe('2026-09-01T00:00:00Z');

        done();
      });
    });
  });

  describe('create', () => {
    it('should send the dto and return a category mapping', (done) => {
      const dto = { name: 'Fire', parent_id: null };
      const mockResult = { id: '2', ...dto, created_at: 'now', updated_at: 'now' };
      httpMock.post.mockReturnValue(of(mockResult));

      service.create(dto).subscribe((res) => {
        expect(httpMock.post).toHaveBeenCalledWith('/incident-categories', dto);
        expect(res.name).toBe('Fire');
        done();
      });
    });
  });

  // the remaining tests can just check arguments
  describe('getById', () => {
    it('should fetch category by id', (done) => {
      httpMock.get.mockReturnValue(of({ id: '1', name: 'Cat1' }));
      service.getById('1').subscribe((res) => {
        expect(httpMock.get).toHaveBeenCalledWith('/incident-categories/1');
        expect(res.name).toBe('Cat1');
        done();
      });
    });
  });

  describe('update', () => {
    it('should update category', (done) => {
      httpMock.patch.mockReturnValue(of({ id: '1', name: 'Cat Updated' }));
      service.update('1', { name: 'Cat Updated' }).subscribe((res) => {
        expect(httpMock.patch).toHaveBeenCalledWith('/incident-categories/1', { name: 'Cat Updated' });
        expect(res.name).toBe('Cat Updated');
        done();
      });
    });
  });

  describe('remove', () => {
    it('should delete category', (done) => {
      httpMock.delete.mockReturnValue(of(undefined));
      service.remove('1').subscribe(() => {
        expect(httpMock.delete).toHaveBeenCalledWith('/incident-categories/1');
        done();
      });
    });
  });
});
