import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { UserService, UserProfile } from './user.service';

/**
 * F6 perfil-redesign fixes (`fixes-required.md` C.2.3) — contrato del
 * `UserService` dedicado a `/users/me*`. Afirma sobre método, URL,
 * body/multipart enviado y el wire shape devuelto (snake_case, per
 * `SnakeCaseResponseInterceptor`).
 */
describe('UserService', () => {
  let service: UserService;
  let http: HttpTestingController;
  const base = '/api';

  const fixtureUser: UserProfile = {
    id: 'c3b1a2d4-0000-4000-8000-000000000001',
    first_name: 'Juan',
    last_name: 'Pérez',
    phone: '+593991234567',
    email: 'juan@test.com',
    avatar_url: 'https://cdn.example.com/avatar.jpg',
    updated_at: '2026-09-08T12:24:18.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UserService],
    });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('getCurrentUser — GET /api/users/me, devuelve el wire completo', (done) => {
    service.getCurrentUser().subscribe((user) => {
      expect(user.id).toBe(fixtureUser.id);
      expect(user.first_name).toBe('Juan');
      expect(user.last_name).toBe('Pérez');
      expect(user.phone).toBe('+593991234567');
      expect(user.avatar_url).toBe('https://cdn.example.com/avatar.jpg');
      done();
    });
    const req = http.expectOne(`${base}/users/me`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(fixtureUser);
  });

  it('updateProfile — PATCH /api/users/me con JSON snake_case (no multipart)', (done) => {
    const payload = { first_name: 'Juan', last_name: 'Pérez', phone: '+593991234567' };
    service.updateProfile(payload).subscribe((user) => {
      expect(user.first_name).toBe('Juan');
      done();
    });
    const req = http.expectOne(`${base}/users/me`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.withCredentials).toBe(true);
    // JSON body, no FormData — confirma que no viaja como multipart.
    expect(req.request.body).toEqual(payload);
    expect(req.request.body instanceof FormData).toBe(false);
    req.flush(fixtureUser);
  });

  it('uploadProfileImage — POST /api/users/me/avatar, multipart con campo "avatar"', (done) => {
    const file = new File(['x'], 'avatar.jpg', { type: 'image/jpeg' });
    service.uploadProfileImage(file).subscribe((user) => {
      expect(user.avatar_url).toBe(fixtureUser.avatar_url);
      done();
    });
    const req = http.expectOne(`${base}/users/me/avatar`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body instanceof FormData).toBe(true);
    const body = req.request.body as FormData;
    expect(body.get('avatar')).toBe(file);
    expect(body.get('file')).toBeNull(); // el campo admin ("file") no debe usarse acá
    req.flush(fixtureUser);
  });
});
