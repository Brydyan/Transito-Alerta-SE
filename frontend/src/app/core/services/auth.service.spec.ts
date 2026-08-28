import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

/**
 * E1 — auth.service.spec.ts
 *
 * Fixtures match the REAL backend contract (snake_case) sourced
 * from `backend/src/modules/auth/auth.service.ts` (AuthTokens) and
 * `dto/{login,refresh}.dto.ts`. If the backend wire shape changes,
 * update this file AND auth.model.ts together.
 */
describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;
  const apiUrl = `${environment.apiUrl}/auth`;
  const env = environment.production ? 'production' : 'development';

  // ───── Real contract fixtures ─────
  const tokens = {
    access_token: 'jwt.access.token',
    refresh_token: 'jwt.refresh.token',
    permissions: ['READ incidents', 'CREATE comments'],
  };

  const me = {
    user_id: 'user-1',
    device_uuid: 'dev-uuid-1',
    permissions: tokens.permissions,
  };

  beforeEach(() => {
    // Clear BEFORE instantiating — AuthService reads localStorage at
    // construction for the access_token + refresh_token signals.
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  // ───── E1.1 login (device_uuid) — anonymous flow ─────
  it('login(device_uuid) posts to /auth/login and stores tokens + hydrates user from /auth/me', () => {
    service.login({ device_uuid: 'dev-uuid-1' }).subscribe();
    const loginReq = http.expectOne(`${apiUrl}/login`);
    expect(loginReq.request.method).toBe('POST');
    expect(loginReq.request.body).toEqual({ device_uuid: 'dev-uuid-1' });
    loginReq.flush(tokens);

    expect(service.accessToken()).toBe(tokens.access_token);
    expect(service.refreshToken()).toBe(tokens.refresh_token);
    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(`auth_access_token_${env}`)).toBe(tokens.access_token);
    expect(localStorage.getItem(`auth_refresh_token_${env}`)).toBe(tokens.refresh_token);

    // The post-login /me fires automatically.
    const meReq = http.expectOne(`${apiUrl}/me`);
    meReq.flush(me);
    expect(service.user()?.id).toBe('user-1');
    expect(service.user()?.device_uuid).toBe('dev-uuid-1');
    expect(service.user()?.permissions).toEqual(tokens.permissions);
  });

  // ───── E1.2 login (email + password) — credentialed flow ─────
  it('login(email, password) sends the credential shape, not device_uuid', () => {
    service.login({ email: 'admin@correo.com', password: '123456' }).subscribe();
    const req = http.expectOne(`${apiUrl}/login`);
    expect(req.request.body).toEqual({ email: 'admin@correo.com', password: '123456' });
    expect(req.request.body).not.toHaveProperty('device_uuid');
    req.flush(tokens);
    http.expectOne(`${apiUrl}/me`).flush(me);
  });

  // ───── E1.3 login 401 ─────
  it('login on 401 surfaces the error and leaves isAuthenticated() false', () => {
    const errorSpy = jest.fn();
    service.login({ email: 'x@y.com', password: 'wrong' }).subscribe({ error: errorSpy });
    http
      .expectOne(`${apiUrl}/login`)
      .flush({ message: 'Credenciales inválidas' }, { status: 401, statusText: 'Unauthorized' });
    expect(errorSpy).toHaveBeenCalled();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.accessToken()).toBeNull();
  });

  // ───── E1.4 refresh — body uses snake_case refresh_token, NOT cookie ─────
  it('refresh() posts { refresh_token } in the body and updates both tokens', () => {
    // Seed an existing session.
    service.login({ device_uuid: 'dev-uuid-1' }).subscribe();
    http.expectOne(`${apiUrl}/login`).flush(tokens);
    http.expectOne(`${apiUrl}/me`).flush(me);

    const newTokens = { ...tokens, access_token: 'jwt.new' };
    service.refresh().subscribe();
    const req = http.expectOne(`${apiUrl}/refresh`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refresh_token: tokens.refresh_token });
    // The real backend response shape: { access_token, refresh_token, permissions }
    req.flush(newTokens);

    expect(service.accessToken()).toBe('jwt.new');
    expect(service.refreshToken()).toBe(tokens.refresh_token);
    http.expectOne(`${apiUrl}/me`).flush(me);
  });

  // ───── E1.5 refresh on 401 logs the user out ─────
  it('refresh() on 401 clears local state', () => {
    service.login({ device_uuid: 'dev-uuid-1' }).subscribe();
    http.expectOne(`${apiUrl}/login`).flush(tokens);
    http.expectOne(`${apiUrl}/me`).flush(me);

    service.refresh().subscribe({ error: () => undefined });
    http
      .expectOne(`${apiUrl}/refresh`)
      .flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(service.accessToken()).toBeNull();
    expect(service.refreshToken()).toBeNull();
  });

  // ───── E1.6 logout ─────
  it('logout() posts to /auth/logout and clears local state regardless of response', () => {
    service.login({ device_uuid: 'dev-uuid-1' }).subscribe();
    http.expectOne(`${apiUrl}/login`).flush(tokens);
    http.expectOne(`${apiUrl}/me`).flush(me);

    service.logout().subscribe();
    const req = http.expectOne(`${apiUrl}/logout`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true });

    expect(service.isAuthenticated()).toBe(false);
    expect(service.accessToken()).toBeNull();
    expect(localStorage.getItem(`auth_access_token_${env}`)).toBeNull();
  });

  // ───── E1.7 register — REMOVED (backend is 410) ─────
  it('register() throws because the backend endpoint is a 410 tombstone', () => {
    expect(() => service.register()).toThrow(/410 Gone/);
  });

  // ───── E1.8 token persistence — localStorage namespaced by env ─────
  it('persists access + refresh tokens under env-suffixed localStorage keys', () => {
    service.login({ device_uuid: 'dev-uuid-1' }).subscribe();
    http.expectOne(`${apiUrl}/login`).flush(tokens);
    http.expectOne(`${apiUrl}/me`).flush(me);

    expect(localStorage.getItem(`auth_access_token_${env}`)).toBe(tokens.access_token);
    expect(localStorage.getItem(`auth_refresh_token_${env}`)).toBe(tokens.refresh_token);
  });
});
