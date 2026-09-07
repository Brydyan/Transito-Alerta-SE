import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from './auth.service';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { environment } from '../../../environments/environment';

/**
 * Regresión — «recargar la página devuelve al login».
 *
 * El constructor de `AuthService` hidrata la sesión llamando a
 * `/auth/me` cuando encuentra un token en `localStorage`. Esa llamada
 * atraviesa `authInterceptor`, que hace `inject(AuthService)`. Si la
 * petición sale DENTRO del constructor, Angular tiene que resolver
 * `AuthService` mientras todavía lo está construyendo:
 *
 *   NG0200: Circular dependency detected for `_AuthService`
 *
 * El observable falla antes de que ningún request salga del navegador,
 * el `error` del `subscribe` borraba los tokens, el `authGuard` veía la
 * sesión vacía y mandaba al login. Pasaba en TODA recarga y sólo en la
 * recarga: al iniciar sesión, `AuthService` ya está construido.
 *
 * Por eso este spec cablea el interceptor REAL — con `HttpClientTestingModule`
 * a secas no hay interceptor, no hay ciclo, y el bug no se ve.
 */
describe('AuthService — hidratación de sesión al arrancar (regresión de recarga)', () => {
  const apiUrl = `${environment.apiUrl}/auth`;
  const env = environment.production ? 'production' : 'development';

  function bootWithStoredSession(): { service: AuthService; http: HttpTestingController } {
    localStorage.setItem(`auth_access_token_${env}`, 'jwt.access.token');
    localStorage.setItem(`auth_refresh_token_${env}`, 'jwt.refresh.token');

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    return {
      service: TestBed.inject(AuthService),
      http: TestBed.inject(HttpTestingController),
    };
  }

  afterEach(() => {
    localStorage.clear();
  });

  it('emite GET /auth/me sin disparar NG0200 y conserva la sesión', async () => {
    const { service, http } = bootWithStoredSession();

    // La petición se difiere fuera del constructor: hay que dejar
    // correr la microtarea antes de esperarla.
    await Promise.resolve();

    const meReq = http.expectOne(`${apiUrl}/me`);
    expect(meReq.request.headers.get('Authorization')).toBe('Bearer jwt.access.token');
    meReq.flush({
      user_id: 'user-1',
      device_uuid: 'dev-uuid-1',
      permissions: [],
      email_verified: true,
      role_name: 'admin_org',
    });

    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(`auth_access_token_${env}`)).toBe('jwt.access.token');
    expect(service.user()?.id).toBe('user-1');

    http.verify();
  });

  it('un 500 al hidratar NO cierra la sesión — sólo la rechaza el 401', async () => {
    const { service, http } = bootWithStoredSession();
    await Promise.resolve();

    http
      .expectOne(`${apiUrl}/me`)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(`auth_access_token_${env}`)).toBe('jwt.access.token');

    http.verify();
  });

  it('un 401 que el refresh no salva sí cierra la sesión', async () => {
    const { service, http } = bootWithStoredSession();
    await Promise.resolve();

    // 401 en /me → el interceptor intenta un refresh…
    http
      .expectOne(`${apiUrl}/me`)
      .flush({ message: 'nope' }, { status: 401, statusText: 'Unauthorized' });

    // …que también falla: la sesión ya no es recuperable.
    http
      .expectOne(`${apiUrl}/refresh`)
      .flush({ message: 'nope' }, { status: 401, statusText: 'Unauthorized' });

    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(`auth_access_token_${env}`)).toBeNull();

    http.verify();
  });
});
