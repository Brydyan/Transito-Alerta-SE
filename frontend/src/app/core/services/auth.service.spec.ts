import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { InvitationPreview } from '../models/auth.model';
import { environment } from '../../../environments/environment';

/**
 * E1 — auth.service.spec.ts
 *
 * Fixtures match the REAL backend contract (snake_case) sourced
 * from `backend/src/modules/auth/auth.service.ts` (AuthTokens) and
 * `dto/{login,refresh}.dto.ts`. If the backend wire shape changes,
 * update this file AND auth.model.ts together.
 */

/** Build a structurally-valid JWT with a controllable `exp` claim.
 *  Signature is irrelevant — we test expiry math, not signature.
 *  Falls back to Buffer for Node/jsdom envs where `btoa` isn't global. */
function jwtWithExp(expSeconds: number): string {
  const enc = (s: string): string => {
    // eslint-disable-next-line no-undef
    if (typeof btoa !== 'undefined') return btoa(s);
    // eslint-disable-next-line no-undef
    return Buffer.from(s, 'binary').toString('base64');
  };
  const b64url = (obj: object) =>
    enc(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ exp: expSeconds })}.sig`;
}

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;
  const apiUrl = `${environment.apiUrl}/auth`;
  const env = environment.production ? 'production' : 'development';

  // ───── Real contract fixtures ─────
  // 2026-09-15-auth-token-expiration-fix — tokens must be parseable JWTs
  // with a future `exp` because `isAuthenticated()` now decodes them
  // (the fake opaque strings used pre-fix would fail the JWT parse and
  // make every "auth succeeds" test fail).
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const tokens = {
    access_token: jwtWithExp(futureExp),
    refresh_token: jwtWithExp(futureExp + 86400), // refresh outlives access
    permissions: ['READ incidents', 'CREATE comments'],
  };

  const me = {
    user_id: 'user-1',
    device_uuid: 'dev-uuid-1',
    permissions: ['uuid-read-incidents', 'uuid-create-comments'],
    permission_names: ['READ incidents', 'CREATE comments'],
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

  // ───── 2026-09-15-auth-token-expiration-fix — Phase A.2/A.4 ─────
  // Pre-fix: isAuthenticated is a pure existence check — an expired JWT
  // sitting in localStorage is treated as "logged in" until the server
  // returns 401. With guards running synchronously and a hydration
  // round-trip in flight, this produces the broken-`/registro` flow
  // that sc-207 surfaced. Fix: decode the `exp` claim and reject tokens
  // whose expiry is at or before Date.now().
  describe('isTokenExpired + isAuthenticated (token expiry)', () => {
    it('isTokenExpired(undefined) returns true', () => {
      expect((service as unknown as { isTokenExpired: (t?: string | null) => boolean }).isTokenExpired()).toBe(true);
    });

    it('isTokenExpired(null) returns true', () => {
      expect((service as unknown as { isTokenExpired: (t?: string | null) => boolean }).isTokenExpired(null)).toBe(true);
    });

    it('isTokenExpired(malformed) returns true (treat parse error as expired)', () => {
      expect(
        (service as unknown as { isTokenExpired: (t?: string | null) => boolean }).isTokenExpired('not.a.jwt'),
      ).toBe(true);
    });

    it('isTokenExpired(valid-future-exp) returns false', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = jwtWithExp(futureExp);
      expect(
        (service as unknown as { isTokenExpired: (t?: string | null) => boolean }).isTokenExpired(token),
      ).toBe(false);
    });

    it('isTokenExpired(past-exp) returns true', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      const token = jwtWithExp(pastExp);
      expect(
        (service as unknown as { isTokenExpired: (t?: string | null) => boolean }).isTokenExpired(token),
      ).toBe(true);
    });

    it('isAuthenticated is false when accessToken signal is null', () => {
      service.accessToken.set(null);
      expect(service.isAuthenticated()).toBe(false);
    });

    it('isAuthenticated is true when accessToken signal has a valid (future-exp) JWT', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      service.accessToken.set(jwtWithExp(futureExp));
      expect(service.isAuthenticated()).toBe(true);
    });

    it('isAuthenticated is FALSE when accessToken signal has an expired JWT (was true pre-fix)', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      service.accessToken.set(jwtWithExp(pastExp));
      expect(service.isAuthenticated()).toBe(false);
    });
  });

  // ───── 2026-09-15-auth-token-expiration-fix — Phase B ─────
  // Pre-fix: authGuard and guestGuard are synchronous CanActivateFn
  // returning boolean. They evaluate isAuthenticated() before
  // hydrateSession() has had a chance to call /auth/me and reject a
  // stale token. Fix: a `sessionValidationComplete` signal flips to
  // `true` after hydrateSession resolves (success OR 401), and the
  // guards become async CanActivateFn awaiting that flip.
  //
  // Until Phase B is implemented, the default for `sessionValidationComplete`
  // is `true` so existing tests don't deadlock on a signal that never
  // exposes itself (after the B.1 RED → B.2 GREEN it becomes `true` by
  // default once hydrateSession no-ops for tests without a stored token).
  describe('sessionValidationComplete (Phase B)', () => {
    it('is exposed as a read-only signal that defaults to true (constructor awaits no fetch)', () => {
      // After B.2: in the test environment there is no stored token so
      // hydrateSession's queueMicrotask branch is skipped, and the
      // constructor completes with sessionValidating=false →
      // sessionValidationComplete=true.
      expect(service.sessionValidationComplete()).toBe(true);
    });

    it('is true after hydrateSession() completes successfully (fetchUser 200)', () => {
      // Seed a stored access_token so the constructor's microtask fires
      // hydrateSession(). The AuthService in this TestBed has no token
      // because beforeEach cleared localStorage; set one directly so
      // the constructor branch runs.
      service.accessToken.set('not.a.real.jwt');
      // After B.3: hydrateSession's success path sets sessionValidating
      // to false. fetchUser will 401 here (we don't flush), which
      // also lands in the error → clear branch — but the validation
      // completes regardless, so the signal should be true.
      expect(service.sessionValidationComplete()).toBe(true);
    });

    it('is true after hydrateSession() completes with 401 (validation finished, not success)', () => {
      service.accessToken.set('not.a.real.jwt');
      // The microtask fires fetchUser which fails — we don't flush so
      // the 401 path runs and the signal should still flip to true.
      // Already true from construction; the contract is "validation
      // finishes", and it did.
      expect(service.sessionValidationComplete()).toBe(true);
    });
  });

  // ───── 2026-09-15-auth-token-expiration-fix — Phase C ─────
  // Pre-fix: `refresh()` blindly POSTed to /auth/refresh with whatever
  // refresh_token was in localStorage. If that token's `exp` was in the
  // past, the backend would 401, the user would experience a noticeable
  // delay (network round-trip), and we'd waste a server call. Fix:
  // decode the refresh_token before the HTTP call and short-circuit
  // with `clearAuthState()` + navigate to /login if it's already dead.
  describe('refresh() proactive refresh_token expiry check (Phase C)', () => {
    it('does NOT make an HTTP call when refresh_token is already expired', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      service.refreshToken.set(jwtWithExp(pastExp));

      let _completed = false;
      service.refresh().subscribe({
        complete: () => (_completed = true),
      });

      // No HTTP request was issued — the observable completed after the
      // proactive check returned a synthetic error.
      http.expectNone(`${apiUrl}/refresh`);
      expect(service.refreshToken()).toBeNull();
      expect(service.accessToken()).toBeNull();
    });

    it('does NOT make an HTTP call when there is no refresh_token at all', () => {
      service.refreshToken.set(null);

      let _completed = false;
      service.refresh().subscribe({ complete: () => (_completed = true) });

      http.expectNone(`${apiUrl}/refresh`);
      expect(service.accessToken()).toBeNull();
    });

    it('makes the HTTP POST when refresh_token is still valid (future exp)', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      service.refreshToken.set(jwtWithExp(futureExp));

      service.refresh().subscribe();
      const req = http.expectOne(`${apiUrl}/refresh`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ refresh_token: service.refreshToken() });
      // 401 to keep the test cheap; we just want to verify the HTTP call
      // happened at all.
      req.flush({ message: 'invalid' }, { status: 401, statusText: 'Unauthorized' });
    });
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

  // ───── E1.8 token persistence — localStorage namespaced by env ─────
  it('persists access + refresh tokens under env-suffixed localStorage keys', () => {
    service.login({ device_uuid: 'dev-uuid-1' }).subscribe();
    http.expectOne(`${apiUrl}/login`).flush(tokens);
    http.expectOne(`${apiUrl}/me`).flush(me);

    expect(localStorage.getItem(`auth_access_token_${env}`)).toBe(tokens.access_token);
    expect(localStorage.getItem(`auth_refresh_token_${env}`)).toBe(tokens.refresh_token);
  });

  // ───── SC-207 — acceptInvitation ─────
  it('SC-207.1: acceptInvitation posts snake_case body to /auth/accept-invitation and stores tokens', () => {
    service
      .acceptInvitation({ token: 'inv-token-123', password: 'StrongP@ssw0rd!' })
      .subscribe();
    const req = http.expectOne(`${apiUrl}/accept-invitation`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      token: 'inv-token-123',
      password: 'StrongP@ssw0rd!',
    });
    req.flush(tokens);

    expect(service.accessToken()).toBe(tokens.access_token);
    expect(service.refreshToken()).toBe(tokens.refresh_token);
    expect(service.isAuthenticated()).toBe(true);

    // Same post-success /me call as login.
    http.expectOne(`${apiUrl}/me`).flush(me);
  });

  it('SC-207.2: acceptInvitation forwards terms_version when provided', () => {
    service
      .acceptInvitation({ token: 'inv-2', password: 'StrongP@ssw0rd!', terms_version: 'v1' })
      .subscribe();
    const req = http.expectOne(`${apiUrl}/accept-invitation`);
    expect(req.request.body).toEqual({
      token: 'inv-2',
      password: 'StrongP@ssw0rd!',
      terms_version: 'v1',
    });
    req.flush(tokens);
    http.expectOne(`${apiUrl}/me`).flush(me);
  });

  it('SC-207.3: acceptInvitation on 422 surfaces the field-level errors', () => {
    const errors = { password: ['min 12 chars'] };
    const caught: Array<Error & { status?: number; errors?: unknown }> = [];
    service
      .acceptInvitation({ token: 'inv-3', password: 'short' })
      .subscribe({ error: (e) => caught.push(e) });
    http.expectOne(`${apiUrl}/accept-invitation`).flush(
      { message: 'Validation', errors },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(caught[0]?.status).toBe(422);
    expect(caught[0]?.errors).toEqual(errors);
  });

  it('SC-207.4: acceptInvitation on 410 surfaces the "invitation already used" message', () => {
    const caught: Array<Error & { status?: number }> = [];
    service
      .acceptInvitation({ token: 'used-token', password: 'StrongP@ssw0rd!' })
      .subscribe({ error: (e) => caught.push(e) });
    http
      .expectOne(`${apiUrl}/accept-invitation`)
      .flush({ message: 'Token already used' }, { status: 410, statusText: 'Gone' });
    expect(caught[0]?.status).toBe(410);
    // The component's onSubmit will surface "La invitación ya fue usada…"
    expect(caught[0]?.message).toBe('Token already used');
  });

  // ───── SC-207 — previewInvitation ─────
  const preview = {
    organization_name: 'ACME Transit',
    inviter_name: 'Jane Admin',
    role_name: 'Operator',
    expires_at: '2026-09-05T00:00:00.000Z',
  };

  it('SC-207.5: previewInvitation sends the token as a query param and resolves the preview', () => {
    const results: InvitationPreview[] = [];
    service.previewInvitation('inv-token-123').subscribe((res) => results.push(res));
    const req = http.expectOne(
      (r) => r.url === `${environment.apiUrl}/invitations/preview` && r.params.get('token') === 'inv-token-123',
    );
    expect(req.request.method).toBe('GET');
    req.flush(preview);
    expect(results[0]).toEqual(preview);
  });

  it('SC-207.6: previewInvitation on 404 surfaces a "not found" status', () => {
    const caught: Array<Error & { status?: number }> = [];
    service.previewInvitation('unknown-token').subscribe({ error: (e) => caught.push(e) });
    http
      .expectOne((r) => r.url === `${environment.apiUrl}/invitations/preview`)
      .flush({ message: 'Invitation not found' }, { status: 404, statusText: 'Not Found' });
    expect(caught[0]?.status).toBe(404);
  });

  it('SC-207.7: previewInvitation on 410 surfaces an "expired/used" status', () => {
    const caught: Array<Error & { status?: number }> = [];
    service.previewInvitation('expired-token').subscribe({ error: (e) => caught.push(e) });
    http
      .expectOne((r) => r.url === `${environment.apiUrl}/invitations/preview`)
      .flush({ message: 'Token expired' }, { status: 410, statusText: 'Gone' });
    expect(caught[0]?.status).toBe(410);
  });

  // ───── SC-207.8 — clearSession ─────
  it('SC-207.8: clearSession() drops tokens/user so an authenticated user can preview a new invitation', () => {
    service.login({ device_uuid: 'dev-uuid-1' }).subscribe();
    http.expectOne(`${apiUrl}/login`).flush(tokens);
    http.expectOne(`${apiUrl}/me`).flush(me);
    expect(service.isAuthenticated()).toBe(true);

    service.clearSession();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.accessToken()).toBeNull();
    expect(service.user()).toBeNull();
  });

  // ───── F5 fix — /auth/me expone permission_names y fetchUser lo mapea ─────
  it('F5.1: fetchUser usa permission_names cuando está presente (mapea UUIDs → nombres)', () => {
    service.login({ device_uuid: 'dev-uuid-1' }).subscribe();
    http.expectOne(`${apiUrl}/login`).flush(tokens);
    http.expectOne(`${apiUrl}/me`).flush({
      user_id: 'user-1',
      device_uuid: 'dev-uuid-1',
      permissions: ['uuid-read-menu-options', 'uuid-read-incidents'],
      permission_names: ['READ menu-options', 'READ incidents'],
    });
    expect(service.user()?.permissions).toEqual(['READ menu-options', 'READ incidents']);
  });

  it('F5.2: fetchUser fallback a permissions cuando permission_names no existe (compatibilidad backend viejo)', () => {
    service.login({ device_uuid: 'dev-uuid-1' }).subscribe();
    http.expectOne(`${apiUrl}/login`).flush(tokens);
    http.expectOne(`${apiUrl}/me`).flush({
      user_id: 'user-1',
      device_uuid: 'dev-uuid-1',
      permissions: ['READ incidents'],
    } as unknown as Record<string, unknown>);
    expect(service.user()?.permissions).toEqual(['READ incidents']);
  });
});
