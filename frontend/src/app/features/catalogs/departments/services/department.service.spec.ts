import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { DepartmentService } from './department.service';
import { HttpService } from '../../../../core/services/http.service';
import {
  ICreateDepartmentDto,
  IDepartment,
  IDeleteDepartmentResponse,
  IUpdateDepartmentDto,
} from '../interfaces/idepartment.interface';

describe('DepartmentService', () => {
  let service: DepartmentService;
  let httpMock: {
    get: jest.Mock;
    post: jest.Mock;
    patch: jest.Mock;
    delete: jest.Mock;
  };

  const mockDept: IDepartment = {
    id: 'dept-1',
    name: 'Traffic',
    description: 'Manages traffic incidents',
    organization_id: 'org-1',
    organization_name: 'GAD Quito',
    user_count: 7,
    created_at: '2026-09-15T20:00:00Z',
    updated_at: '2026-09-15T20:00:00Z',
    deleted_at: null,
  };

  beforeEach(() => {
    httpMock = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
    TestBed.configureTestingModule({
      providers: [DepartmentService, { provide: HttpService, useValue: httpMock }],
    });
    service = TestBed.inject(DepartmentService);
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  describe('list', () => {
    it('GETs /departments with search + pagination params', (done) => {
      httpMock.get.mockReturnValue(of({ items: [mockDept], total: 1 }));

      service.list({ search: 'traffic', page: 2, per_page: 20 }).subscribe((res) => {
        expect(httpMock.get).toHaveBeenCalledWith('/departments', {
          search: 'traffic',
          page: 2,
          per_page: 20,
        });
        expect(res.items.length).toBe(1);
        expect(res.total).toBe(1);
        done();
      });
    });

    it('passes organization_id through when provided', (done) => {
      httpMock.get.mockReturnValue(of({ items: [], total: 0 }));

      service.list({ organization_id: 'org-1' }).subscribe(() => {
        expect(httpMock.get).toHaveBeenCalledWith('/departments', {
          organization_id: 'org-1',
        });
        done();
      });
    });

    it('passes an empty params object when called with no args', (done) => {
      httpMock.get.mockReturnValue(of({ items: [], total: 0 }));

      service.list().subscribe(() => {
        // Default param in the signature is `{}`, so the service calls
        // `http.get('/departments', {})`. HttpService.get then internally
        // turns that into HttpParams; the mock just sees the raw call.
        expect(httpMock.get).toHaveBeenCalledWith('/departments', {});
        done();
      });
    });
  });

  describe('getById', () => {
    it('GETs /departments/:id and unwraps the { department, category_ids } envelope', (done) => {
      const envelope = {
        department: mockDept,
        category_ids: ['cat-1', 'cat-2'],
      };
      httpMock.get.mockReturnValue(of(envelope));

      service.getById('dept-1').subscribe((dept) => {
        expect(httpMock.get).toHaveBeenCalledWith('/departments/dept-1');
        expect(dept.id).toBe('dept-1');
        expect(dept.category_ids).toEqual(['cat-1', 'cat-2']);
        done();
      });
    });
  });

  describe('create', () => {
    it('POSTs to /departments with the DTO', (done) => {
      const dto: ICreateDepartmentDto = {
        name: 'Mobility',
        description: 'Mobility dept',
        organization_id: 'org-1',
      };
      httpMock.post.mockReturnValue(of({ ...mockDept, ...dto }));

      service.create(dto).subscribe((dept) => {
        expect(httpMock.post).toHaveBeenCalledWith('/departments', dto);
        expect(dept.name).toBe('Mobility');
        done();
      });
    });

    it('sends null description when omitted', (done) => {
      const dto: ICreateDepartmentDto = { name: 'X', description: null, organization_id: 'org-1' };
      httpMock.post.mockReturnValue(of({ ...mockDept, name: 'X' }));

      service.create(dto).subscribe(() => {
        expect(httpMock.post).toHaveBeenCalledWith('/departments', dto);
        done();
      });
    });
  });

  describe('update', () => {
    it('PATCHes /departments/:id with the DTO', (done) => {
      const dto: IUpdateDepartmentDto = { name: 'Mobility & Parking' };
      httpMock.patch.mockReturnValue(of({ ...mockDept, name: 'Mobility & Parking' }));

      service.update('dept-1', dto).subscribe((dept) => {
        expect(httpMock.patch).toHaveBeenCalledWith('/departments/dept-1', dto);
        expect(dept.name).toBe('Mobility & Parking');
        done();
      });
    });
  });

  describe('remove', () => {
    it('DELETEs /departments/:id and returns the { id, deleted_at } envelope (D8)', (done) => {
      const deleted: IDeleteDepartmentResponse = {
        id: 'dept-1',
        deleted_at: '2026-09-15T20:30:00Z',
      };
      httpMock.delete.mockReturnValue(of(deleted));

      service.remove('dept-1').subscribe((res) => {
        expect(httpMock.delete).toHaveBeenCalledWith('/departments/dept-1');
        expect(res.id).toBe('dept-1');
        expect(res.deleted_at).toBe('2026-09-15T20:30:00Z');
        done();
      });
    });
  });
});
