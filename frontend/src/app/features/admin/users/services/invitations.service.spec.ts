import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { InvitationsService } from './invitations.service';
import { environment } from '../../../../../environments/environment';

/**
 * F6 (`2026-09-08-f6-new-user-form`, D-frontend-6) — `POST
 * /api/admin/users/invite`. El spec verifica:
 *  - URL, método, withCredentials
 *  - body snake_case (rol_id, organization_id)
 *  - omite organization_id cuando es null
 *  - la respuesta del backend (con `expires_at`, `created_at` en
 *    snake_case) llega al subscriber
 */
describe('InvitationsService (F6 new-user-form)', () => {
  let service: InvitationsService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/admin/users/invite`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [InvitationsService],
    });
    service = TestBed.inject(InvitationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('invite — POST con payload snake_case y withCredentials', () => {
    service
      .invite({ email: 'juan@municipio.gob.ec', roleId: 'r1', organizationId: 'o1' })
      .subscribe((res) => {
        expect(res).toEqual({
          id: 'inv-1',
          email: 'juan@municipio.gob.ec',
          role_id: 'r1',
          organization_id: 'o1',
          expires_at: '2026-09-15T00:00:00Z',
          created_at: '2026-09-08T22:30:00Z',
        });
      });
    const req = http.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({
      email: 'juan@municipio.gob.ec',
      role_id: 'r1',
      organization_id: 'o1',
    });
    req.flush({
      id: 'inv-1',
      email: 'juan@municipio.gob.ec',
      role_id: 'r1',
      organization_id: 'o1',
      expires_at: '2026-09-15T00:00:00Z',
      created_at: '2026-09-08T22:30:00Z',
    });
  });

  it('invite — omite organization_id cuando es null', () => {
    service.invite({ email: 'x@y.z', roleId: 'r1', organizationId: null }).subscribe();
    const req = http.expectOne(url);
    const body = req.request.body as Record<string, unknown>;
    expect(body).toEqual({ email: 'x@y.z', role_id: 'r1' });
    expect(body['organization_id']).toBeUndefined();
    req.flush({ id: 'inv-2' });
  });
});
