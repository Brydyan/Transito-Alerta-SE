import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  Observable,
  tap,
  catchError,
  throwError,
  switchMap,
  timer,
  Subscription,
  shareReplay,
  of,
  delay
} from 'rxjs';
import { LoginRequest, LoginResponse, RefreshTokenResponse, User } from '../models/auth.model';
import { environment } from '../../../environments/environment';
import { MenuService } from './menu.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly menuService = inject(MenuService);

  private readonly API_URL = `${environment.apiUrl}/auth`;

  private readonly tokenSignal = signal<string | null>(this.getStoredToken());
  private readonly sidSignal = signal<string | null>(this.getStoredSid());
  private readonly tokenCreatedAtSignal = signal<string | null>(this.getStoredTokenCreatedAt());
  private readonly tokenExpiresAtSignal = signal<string | null>(this.getStoredTokenExpiresAt());
  private readonly userSignal = signal<User | null>(this.getStoredUser());

  readonly isAuthenticated = computed(() => !!this.tokenSignal());
  readonly currentUser = computed(() => this.userSignal());
  readonly token = computed(() => this.tokenSignal());
  readonly sid = computed(() => this.sidSignal());
  readonly tokenCreatedAt = computed(() => this.tokenCreatedAtSignal());
  readonly tokenExpiresAt = computed(() => this.tokenExpiresAtSignal());

  private refreshTimerSubscription: Subscription | null = null;

  // login(credentials: LoginRequest): Observable<LoginResponse> {
  //   return this.http
  //     .post<LoginResponse>(`${this.API_URL}/login`, credentials, { withCredentials: true })
  //     .pipe(
  //       tap((response: LoginResponse) => this.handleLoginSuccess(response)),
  //       catchError((error) => this.handleError(error)),
  //     );
  // }

  //MOCK temporal para el login
  login(credentials: { email?: string; password?: string; device_uuid?: string }): Observable<any> {
    // 1. Simulamos una respuesta exitosa del backend
    const mockResponse = {
      access_token: 'mock.access.token.123',
      refresh_token: 'mock.refresh.token.456',
      user: {
        id: 'user_123',
        permissions: ['admin:read', 'admin:write'],
      },
    };
    // 2. Usamos 'of' y 'delay' de RxJS para simular el tiempo de espera de la red (1.5 segundos)
    return of(mockResponse).pipe(
      delay(1500),
      tap((response) => {
        // Validamos credenciales falsas
        if (credentials.email === 'admin@correo.com' && credentials.password === '123456') {
          const mockUser: User = {
            id: response.user.id,
            email: credentials.email,
            name: 'Administrador Mock',
            roleId: 1,
            roleName: 'Admin',
            avatar: null,
          };
          const created = new Date().toISOString();
          const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
          
          this.updateSignalsAndStorage(response.access_token, 'mock_sid_789', created, expires, mockUser);

          // Redirigimos al usuario al dashboard (es ruta hija de /app)
          this.router.navigate(['/app/dashboard']);
        } else {
          // Simulamos un error HTTP si las credenciales están mal
          throw new Error('Credenciales inválidas');
        }
      }),
    );
  }

  // logout(): void {
  //   this.cancelRefreshTimer();
  //   this.http.post(`${this.API_URL}/logout`, {}, { withCredentials: true }).subscribe({
  //     next: () => this.executeLocalLogout(),
  //     error: () => this.executeLocalLogout(),
  //   });
  // }
  logout() {
    localStorage.removeItem('access_token');
    this.router.navigate(['/auth/login']);
  }

  private executeLocalLogout(): void {
    this.clearAuthData();
    this.menuService.clearMenu();
    this.router.navigate(['/login']);
  }

  private refreshInProgress$: Observable<RefreshTokenResponse> | null = null;

  refreshToken(): Observable<RefreshTokenResponse> {
    if (this.refreshInProgress$) {
      return this.refreshInProgress$;
    }

    this.refreshInProgress$ = this.http
      .post<RefreshTokenResponse>(`${this.API_URL}/refresh`, {}, { withCredentials: true })
      .pipe(
        tap((response: RefreshTokenResponse) => {
          this.handleRefreshSuccess(response);
          this.refreshInProgress$ = null;
        }),
        catchError((error) => {
          this.refreshInProgress$ = null;
          console.error('Error al refrescar token:', error);
          return throwError(() => error);
        }),
        shareReplay(1),
      );

    return this.refreshInProgress$;
  }

  private calculateRefreshDelay(): number {
    const expiresAt = this.tokenExpiresAtSignal();
    if (!expiresAt) return 0;
    const expirationTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const createdAt = this.tokenCreatedAtSignal();
    const createdTime = createdAt ? new Date(createdAt).getTime() : now;

    const lifetime = expirationTime - createdTime;

    let refreshTime: number;
    if (lifetime <= 3 * 60 * 1000) {
      refreshTime = createdTime + lifetime * 0.8;
    } else {
      refreshTime = expirationTime - 2 * 60 * 1000;
    }

    const delayMs = refreshTime - now;
    return delayMs > 0 ? delayMs : 0;
  }

  constructor() {
    if (this.isAuthenticated()) {
      this.startRefreshTimer();
    }
  }

  private startRefreshTimer(): void {
    this.cancelRefreshTimer();

    if (!this.isAuthenticated() || !this.tokenExpiresAtSignal()) {
      return;
    }

    const delayMs = this.calculateRefreshDelay();

    this.refreshTimerSubscription = timer(delayMs)
      .pipe(switchMap(() => this.refreshToken()))
      .subscribe({
        next: () => console.log('Token refrescado automaticamente'),
        error: (error) => console.error('Error en auto-refresh:', error),
      });
  }

  private cancelRefreshTimer(): void {
    if (this.refreshTimerSubscription) {
      this.refreshTimerSubscription.unsubscribe();
      this.refreshTimerSubscription = null;
    }
  }

  private handleLoginSuccess(response: LoginResponse): void {
    const { sub, accessToken, sid, email, nombre, rolId, nombreRol, avatar, accessTokenInfo } =
      response;

    const createdAt = accessTokenInfo?.iatDate || new Date().toISOString();
    const expiresAt =
      accessTokenInfo?.expDate || new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const user: User = {
      id: String(sub),
      email: email || '',
      name: nombre || 'Usuario',
      roleId: rolId,
      roleName: nombreRol || 'Usuario',
      avatar,
    };

    this.updateSignalsAndStorage(accessToken, String(sid), createdAt, expiresAt, user);
    this.startRefreshTimer();
  }

  private handleRefreshSuccess(response: RefreshTokenResponse): void {
    const newAccessToken = response.accessToken;
    const createdAt = response.createdAt || new Date().toISOString();
    const expiresAt = response.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString();

    this.tokenSignal.set(newAccessToken);
    this.tokenCreatedAtSignal.set(createdAt);
    this.tokenExpiresAtSignal.set(expiresAt);

    localStorage.setItem('token', newAccessToken);
    localStorage.setItem('tokenCreatedAt', createdAt);
    localStorage.setItem('tokenExpiresAt', expiresAt);

    this.startRefreshTimer();
  }

  private updateSignalsAndStorage(
    token: string,
    sid: string,
    created: string,
    expires: string,
    user: User,
  ): void {
    this.tokenSignal.set(token);
    this.sidSignal.set(sid);
    this.tokenCreatedAtSignal.set(created);
    this.tokenExpiresAtSignal.set(expires);
    this.userSignal.set(user);

    localStorage.setItem('token', token);
    localStorage.setItem('sid', sid);
    localStorage.setItem('tokenCreatedAt', created);
    localStorage.setItem('tokenExpiresAt', expires);
    localStorage.setItem('user', JSON.stringify(user));
  }

  private clearAuthData(): void {
    this.tokenSignal.set(null);
    this.sidSignal.set(null);
    this.tokenCreatedAtSignal.set(null);
    this.tokenExpiresAtSignal.set(null);
    this.userSignal.set(null);

    const keys = ['token', 'sid', 'tokenCreatedAt', 'tokenExpiresAt', 'user'];
    keys.forEach((key) => localStorage.removeItem(key));

    this.cancelRefreshTimer();
  }

  private getStoredToken(): string | null {
    return localStorage.getItem('token');
  }

  private getStoredSid(): string | null {
    return localStorage.getItem('sid');
  }

  private getStoredTokenCreatedAt(): string | null {
    return localStorage.getItem('tokenCreatedAt');
  }

  private getStoredTokenExpiresAt(): string | null {
    return localStorage.getItem('tokenExpiresAt');
  }

  private getStoredUser(): User | null {
    const userJson = localStorage.getItem('user');
    if (!userJson) return null;
    try {
      return JSON.parse(userJson);
    } catch {
      return null;
    }
  }

  updateCurrentUser(patch: Partial<User>): void {
    const current = this.userSignal();
    if (!current) return;
    const updated: User = { ...current, ...patch };
    this.userSignal.set(updated);
    localStorage.setItem('user', JSON.stringify(updated));
  }

  private handleError(error: { error?: { message?: string }; status?: number }): Observable<never> {
    console.error('Error en autenticacion:', error);
    let errorMessage = 'Ocurrio un error en el servidor';
    if (error.error?.message) {
      errorMessage = error.error.message;
    } else if (error.status === 401) {
      errorMessage = 'Credenciales invalidas';
    } else if (error.status === 0) {
      errorMessage = 'No se pudo conectar con el servidor';
    }
    return throwError(() => new Error(errorMessage));
  }
}
