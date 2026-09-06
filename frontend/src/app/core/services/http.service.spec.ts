import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpService } from './http.service';
import { environment } from '../../../environments/environment';

describe('HttpService', () => {
  let service: HttpService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [HttpService]
    });
    service = TestBed.inject(HttpService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should send GET request with query params', () => {
    const dummyData = { id: 1, name: 'Test' };
    const params = { page: 1, limit: 10 };

    service.get<any>('/test', params).subscribe(res => {
      expect(res).toEqual(dummyData);
    });

    const req = httpMock.expectOne(req => req.url === `${environment.apiUrl}/test` && req.params.get('page') === '1');
    expect(req.request.method).toBe('GET');
    req.flush(dummyData);
  });
  
  it('should send POST request', () => {
    const dummyData = { id: 1 };
    const body = { title: 'New' };

    service.post<any>('/test', body).subscribe(res => {
      expect(res).toEqual(dummyData);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/test`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(dummyData);
  });
});
