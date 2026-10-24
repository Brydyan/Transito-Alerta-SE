import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal, WritableSignal } from '@angular/core';
import { Observable, firstValueFrom, isObservable } from 'rxjs';
import { permissionGuard } from './permission.guard';
import { AuthService } from '../services/auth.service';
import { User } from '../models/auth.model';

describe('permissionGuard', () => {
  let routerMock: { navigate: jest.Mock };
  let userSignal: WritableSignal<User | null>;
  let accessTokenSignal: WritableSignal<string | null>;
  let mockAuthService: unknown;

  const runGuard = (permission?: string) => {
    const route = {
      data: permission === undefined ? {} : { permission },
    } as never;
    return TestBed.runInInjectionContext(() =>
      permissionGuard(route, null as never),
    );
  };

  // 2026-10-19-dashboard-permission-gate — helper para armar un
  // `User` con el rol que el caso quiera. Mantiene los tests
  // legibles: el guard ahora consulta `roleName` además de
  // `permissions`.
  const asUser = (roleName: string, permissions: string[]): User => {
    return {
      id: 'u-test',
      roleName,
      emailVerified: true,
      permissions,
    } as unknown as User;
  };

  beforeEach(() => {
    routerMock = { navigate: jest.fn() };
    // Default: staff con `CREATE` (equivale al viejo `currentUser`
    // con `{ permissions: ['CREATE'] }`). Los tests individuales
    // ajustan el signal si necesitan otro rol.
    userSignal = signal<User | null>(asUser('admin_org', ['CREATE']));
    accessTokenSignal = signal<string | null>('a-token');

    mockAuthService = {
      user: userSignal,
      isAuthenticated: () => accessTokenSignal() !== null,
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerMock },
        { provide: AuthService, useValue: mockAuthService },
      ],
    });
  });

  it('returns true when route.data.permission is in user permissions', () => {
    expect(runGuard('CREATE')).toBe(true);
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  // 2026-10-19-dashboard-permission-gate — el destino del rebote
  // depende del rol. Staff → /app/dashboard (default histórico).
  it('staff sin permiso → navega a /app/dashboard y devuelve false', () => {
    expect(runGuard('DELETE')).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/app/dashboard']);
  });

  // 2026-10-19-dashboard-permission-gate — reporter no tiene
  // `READ dashboard`. Si el rebote genérico lo mandara al
  // dashboard, entraría en loop con el guard nuevo. El guard
  // lo manda a /app/inicio (página universal sin permiso).
  it('reporter sin permiso → navega a /app/inicio (no dashboard)', () => {
    userSignal.set(asUser('reporter', ['READ something-else']));
    expect(runGuard('DELETE')).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/app/inicio']);
    expect(routerMock.navigate).not.toHaveBeenCalledWith(['/app/dashboard']);
  });

  it('returns true when route.data.permission is undefined', () => {
    expect(runGuard()).toBe(true);
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  /**
   * The regression these cover: on a hard refresh or a deep link,
   * `AuthService.user` is still `null` while `GET /auth/me` is in flight.
   * Deciding synchronously there saw zero permissions and bounced every
   * legitimate user to the dashboard.
   */
  describe('while the session is still hydrating', () => {
    beforeEach(() => {
      // Token restored from storage, `/auth/me` has not landed yet.
      userSignal.set(null);
      accessTokenSignal.set('a-token');
    });

    it('does not decide synchronously', () => {
      const result = runGuard('CREATE');
      expect(isObservable(result)).toBe(true);
      expect(routerMock.navigate).not.toHaveBeenCalled();
    });

    it('allows navigation once the user arrives holding the permission', async () => {
      const result = runGuard('CREATE') as Observable<boolean>;
      const settled = firstValueFrom(result);

      userSignal.set(asUser('admin_org', ['CREATE', 'READ']));
      TestBed.tick();

      await expect(settled).resolves.toBe(true);
      expect(routerMock.navigate).not.toHaveBeenCalled();
    });

    it('staff sin permiso (luego de hidratar) → bloquea y va a /app/dashboard', async () => {
      const result = runGuard('DELETE') as Observable<boolean>;
      const settled = firstValueFrom(result);

      userSignal.set(asUser('admin_org', ['CREATE']));
      TestBed.tick();

      await expect(settled).resolves.toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/app/dashboard']);
    });

    // 2026-10-19-dashboard-permission-gate — reporter hidratado
    // sin el permiso requerido → rebota a /app/inicio, NO al
    // dashboard (cubre el caso "deep-link a una ruta gated que
    // toca cuando la sesión todavía se está restaurando").
    it('reporter sin permiso (luego de hidratar) → bloquea y va a /app/inicio', async () => {
      const result = runGuard('DELETE') as Observable<boolean>;
      const settled = firstValueFrom(result);

      userSignal.set(asUser('reporter', ['READ profile']));
      TestBed.tick();

      await expect(settled).resolves.toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/app/inicio']);
    });

    it('redirects to /login when hydration fails and the token is cleared', async () => {
      const result = runGuard('CREATE') as Observable<boolean>;
      const settled = firstValueFrom(result);

      // `clearAuthState()` on a failed `/auth/me`.
      accessTokenSignal.set(null);
      TestBed.tick();

      await expect(settled).resolves.toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  it('redirects to /login when there is no session at all', () => {
    userSignal.set(null);
    accessTokenSignal.set(null);

    expect(runGuard('CREATE')).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
  });
});
