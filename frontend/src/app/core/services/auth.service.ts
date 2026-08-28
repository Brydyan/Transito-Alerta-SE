import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, switchMap, throwError, tap, shareReplay } from 'rxjs';
import {
  AuthTokens,
  LoginRequest,
  LogoutResponse,
  MeResponse,
  RefreshRequest,
  User,
} from '../models/auth.model';
import { environment } from '../../../environments/environment';
import { MenuService } from './menu.service';

/**
 * AuthService — real backend contract.
 *
 * Change `2026-08-28-sc-203-auth-comments-backend-integration` 2nd
 * pass: rewrote to match the actual NestJS `AuthTokens` shape
 * (`{ access_token, refresh_token, permissions }`) and the
 * `LoginRequest` validator (exactly one of { device_uuid } or
 * { email, password }). Removed the `register()` flow because the
 * backend's `POST /auth/register` is a 410 tombstone — registration
 * is invitation-only via `POST /auth/accept-invitation` (deferred
 * to a follow-up change).
 *
 * Wire contracts sourced from:
 *   - backend/src/modules/auth/auth.service.ts (`AuthTokens`)
 *   - backend/src/modules/auth/dto/login.dto.ts
 *   - backend/src/modules/auth/dto/refresh.dto.ts
 *   - backend/src/modules/auth/auth.controller.ts (`/me`, `/logout`)
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly menuService = inject(MenuService);

  private readonly API_URL = `${environment.apiUrl}/auth`;

  // ───── Reactive state (writable signals so the interceptor test
  //        can seed values without going through the HTTP flow) ─────
  readonly accessToken = signal<string | null>(this.getStored('access_token'));
  readonly refreshToken = signal<string | null>(this.getStored('refresh_token'));
  readonly user = signal<User | null>(null);

  readonly isAuthenticated = computed(() => !!this.accessToken());
  readonly currentUser = computed(() => this.user());
  readonly token = this.accessToken; // legacy alias used by auth.interceptor.ts

  private refreshInProgress$: Observable<AuthTokens> | null = null;

  constructor() {
    // If we have a token in storage but no in-memory user, try to
    // hydrate from /auth/me. If the token is expired the call will
    // 401 and the interceptor handles the refresh+retry.
    if (this.accessToken() && !this.user()) {
      this.fetchUser().subscribe({ error: () => this.clearAuthState() });
    }
  }

  // ───── A.1 — Real login ─────
  login(credentials: LoginRequest): Observable<AuthTokens> {
    return this.http
      .post<AuthTokens>(`${this.API_URL}/login`, credentials)
      .pipe(
        tap((tokens) => this.handleLoginSuccess(tokens)),
        catchError((err) => this.handleError(err)),
      );
  }

  // ───── A.3 — Refresh (single-flight, body-based per backend contract) ─────
  refresh(): Observable<AuthTokens> {
    if (this.refreshInProgress$) {
      return this.refreshInProgress$;
    }
    const body: RefreshRequest = { refresh_token: this.refreshToken() ?? '' };
    this.refreshInProgress$ = this.http
      .post<AuthTokens>(`${this.API_URL}/refresh`, body)
      .pipe(
        tap((tokens) => {
          this.handleRefreshSuccess(tokens);
          this.refreshInProgress$ = null;
        }),
        catchError((err) => {
          this.refreshInProgress$ = null;
          this.clearAuthState();
          this.router.navigate(['/auth/login']);
          return throwError(() => err);
        }),
        shareReplay(1),
      );
    return this.refreshInProgress$;
  }

  // ───── A.4 — Logout ─────
  logout(): Observable<LogoutResponse> {
    return this.http.post<LogoutResponse>(`${this.API_URL}/logout`, {}).pipe(
      tap(() => this.clearAuthState()),
      catchError((err) => {
        // Even if the server call fails, drop the local session.
        this.clearAuthState();
        return throwError(() => err);
      }),
    );
  }

  // ───── GET /auth/me — used after login to populate the user signal ─────
  fetchUser(): Observable<MeResponse> {
    return this.http
      .get<MeResponse>(`${this.API_URL}/me`)
      .pipe(
        tap((me) => {
          this.user.set({
            id: me.user_id,
            email: null,
            name: null,
            roleId: null,
            roleName: null,
            permissions: me.permissions,
            device_uuid: me.device_uuid,
          });
        }),
      );
  }

  // ───── Register — REMOVED ─────
  //
  // The backend's `POST /auth/register` returns 410 Gone (tombstone,
  // see auth.controller.ts:54-58). The real registration path is
  // `POST /auth/accept-invitation` which accepts an invitation token.
  // That flow is deferred to a follow-up change (Priority 2) because
  // the spec's B.* tasks asked for a public self-registration form
  // that the backend deliberately doesn't support. Re-enable by
  // wiring `acceptInvitation` when that change lands.
  //
  // (Stub kept to throw a clear error if any component still calls
  // the old method.)
  register(): never {
    throw new Error(
      'AuthService.register() is removed: backend POST /auth/register is 410 Gone. ' +
        'Use /auth/accept-invitation instead (deferred to P2).',
    );
  }

  // ───── Helpers ─────
  private handleLoginSuccess(tokens: AuthTokens): void {
    this.persistTokens(tokens);
    this.fetchUser().subscribe({
      error: () => {
        // Even if /me fails, the tokens are valid — keep the user
        // signed in. The user signal stays null until next refresh.
      },
    });
  }

  private handleRefreshSuccess(tokens: AuthTokens): void {
    this.persistTokens(tokens);
    this.fetchUser().subscribe({ error: () => undefined });
  }

  private persistTokens(tokens: AuthTokens): void {
    this.accessToken.set(tokens.access_token);
    this.refreshToken.set(tokens.refresh_token);
    this.persist('access_token', tokens.access_token);
    this.persist('refresh_token', tokens.refresh_token);
  }

  private clearAuthState(): void {
    this.accessToken.set(null);
    this.refreshToken.set(null);
    this.user.set(null);
    ['access_token', 'refresh_token'].forEach((k) => this.persist(k, null));
    this.menuService.clearMenu();
  }

  private persist(key: string, value: string | null): void {
    const env = environment.production ? 'production' : 'development';
    const namespaced = `auth_${key}_${env}`;
    if (value === null) {
      localStorage.removeItem(namespaced);
    } else {
      localStorage.setItem(namespaced, value);
    }
  }

  private getStored(key: string): string | null {
    const env = environment.production ? 'production' : 'development';
    return localStorage.getItem(`auth_${key}_${env}`);
  }

  private handleError(err: { status?: number; error?: { message?: string; errors?: unknown } }): Observable<never> {
    let message = err.error?.message ?? 'Error de autenticación';
    if (err.status === 401) {
      message = 'Credenciales inválidas';
    } else if (err.status === 0) {
      message = 'No se pudo conectar con el servidor';
    }
    const enriched = new Error(message) as Error & {
      status?: number;
      errors?: unknown;
    };
    enriched.status = err.status;
    if (err.status === 422 && err.error?.errors) {
      enriched.errors = err.error.errors;
    }
    return throwError(() => enriched);
  }
}
