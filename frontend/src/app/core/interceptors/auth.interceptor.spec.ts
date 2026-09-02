import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
  withXsrfConfiguration,
} from '@angular/common/http';
import {
  HttpClientTestingModule,
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

/**
 * E3 — auth.interceptor.spec.ts.
 *
 * 2nd pass: removed pre-flight refresh tests because the real
 * `AuthTokens` contract does not expose token expiry, so a
 * pre-flight check is impossible. The refresh path is now purely
 * on-401: 401 from a non-login/non-refresh call → refresh+retry.
 *
 * Por qué las URLs se escriben a mano (D3, design del change
 * `2026-09-01-fix-auth-interceptor-spec-urls`):
 * - El backend expone prefijo `api` (`backend/src/main.ts:30`,
 *   `app.setGlobalPrefix('api')`). **No** hay `enableVersioning`
 *   ni segmento de versión (grep en cero en `backend/src`).
 * - `frontend/src/environments/environment.ts` define `apiUrl: '/api'`.
 * - El literal escrito a mano es deliberado: el test debe tener
 *   una opinión INDEPENDIENTE del `environment`. Si alguien cambia
 *   `apiUrl` por error, el test lo detecta.
 * - Las rutas válidas hoy son `/api/auth/login`, `/api/auth/refresh`,
 *   `/api/auth/me`, `/api/incidents` (controlador real). Un regression
 *   test hermano bloquea cualquier reintroducción de un segmento de
 *   versión (ver `auth.interceptor.regression.spec.ts`).
 */
describe('AuthInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([authInterceptor]),
          withXsrfConfiguration({ cookieName: '', headerName: '' }),
        ),
        provideHttpClientTesting(),
        AuthService,
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  // ───── E3.1 — JWT injected on authed calls ─────
  it('attaches Authorization: Bearer <token> when the user is signed in', () => {
    auth.accessToken.set('jwt-1');
    http.get('/api/incidents').subscribe();
    const req = backend.expectOne('/api/incidents');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-1');
    req.flush([]);
  });

  // ───── E3.2 — No JWT on public calls ─────
  it('does NOT attach Authorization when no token is present', () => {
    http.get('/api/incidents').subscribe();
    const req = backend.expectOne('/api/incidents');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  // ───── E3.3 — 401 on a regular call → refresh + retry ─────
  it('on 401 from a regular call, refreshes and retries the original request', () => {
    auth.accessToken.set('jwt-1');
    auth.refreshToken.set('rt-1');

    http.get('/api/incidents').subscribe();
    backend
      .expectOne('/api/incidents')
      .flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    const refresh = backend.expectOne('/api/auth/refresh');
    expect(refresh.request.method).toBe('POST');
    // Real backend contract: refresh_token in body, snake_case.
    expect(refresh.request.body).toEqual({ refresh_token: 'rt-1' });
    refresh.flush({
      access_token: 'jwt-2',
      refresh_token: 'rt-2',
      permissions: ['READ incidents'],
    });

    const retry = backend.expectOne('/api/incidents');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer jwt-2');
    retry.flush([]);

    // The post-refresh /me fires too.
    backend.expectOne('/api/auth/me').flush({
      user_id: 'user-1',
      device_uuid: 'dev-1',
      permissions: ['READ incidents'],
    });
  });

  // ───── E3.4 — 401 on the refresh endpoint itself does NOT recurse ─────
  it('does NOT retry on 401 from /auth/refresh (would loop forever)', () => {
    auth.accessToken.set('jwt-1');
    auth.refreshToken.set('rt-1');

    // The refresh endpoint returns 401 (refresh token expired).
    // The interceptor must surface this error and NOT try to
    // refresh again — otherwise we'd recurse.
    const errorSpy = jest.fn();
    serviceHttpRefreshAndCatch(auth, http, errorSpy);

    backend
      .expectOne('/api/auth/refresh')
      .flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(errorSpy).toHaveBeenCalled();
  });

  // ───── E3.5 — 401 on the login endpoint does NOT trigger refresh ─────
  it('does NOT refresh on 401 from /auth/login (login failures are terminal)', () => {
    const errorSpy = jest.fn();
    http.post('/api/auth/login', { device_uuid: 'dev-1' }).subscribe({ error: errorSpy });
    backend
      .expectOne('/api/auth/login')
      .flush({ message: 'bad' }, { status: 401, statusText: 'Unauthorized' });

    expect(errorSpy).toHaveBeenCalled();
    // No /auth/refresh call was made.
    backend.expectNone((r) => r.url.includes('/auth/refresh'));
  });
});

function serviceHttpRefreshAndCatch(
  auth: AuthService,
  http: HttpClient,
  errorSpy: jest.Mock,
): void {
  // Manually call the underlying refresh path to trigger a request
  // to /auth/refresh directly (the test isn't using the interceptor
  // to trigger this — it triggers the refresh via the service so we
  // can assert the interceptor doesn't re-enter the refresh on 401).
  auth.refresh().subscribe({ error: errorSpy });
}
