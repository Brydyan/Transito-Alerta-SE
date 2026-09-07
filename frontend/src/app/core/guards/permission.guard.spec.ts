import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal, WritableSignal } from '@angular/core';
import { Observable, firstValueFrom, isObservable } from 'rxjs';
import { permissionGuard } from './permission.guard';
import { AuthService } from '../services/auth.service';

describe('permissionGuard', () => {
  let routerMock: { navigate: jest.Mock };
  let currentUserSignal: WritableSignal<{ permissions: string[] } | null>;
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

  beforeEach(() => {
    routerMock = { navigate: jest.fn() };
    currentUserSignal = signal<{ permissions: string[] } | null>({
      permissions: ['CREATE'],
    });
    accessTokenSignal = signal<string | null>('a-token');

    mockAuthService = {
      currentUser: currentUserSignal,
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

  it('navigates to /app/dashboard and returns false when user lacks permission', () => {
    expect(runGuard('DELETE')).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/app/dashboard']);
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
      currentUserSignal.set(null);
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

      currentUserSignal.set({ permissions: ['CREATE', 'READ'] });
      TestBed.tick();

      await expect(settled).resolves.toBe(true);
      expect(routerMock.navigate).not.toHaveBeenCalled();
    });

    it('blocks once the user arrives without the permission', async () => {
      const result = runGuard('DELETE') as Observable<boolean>;
      const settled = firstValueFrom(result);

      currentUserSignal.set({ permissions: ['CREATE'] });
      TestBed.tick();

      await expect(settled).resolves.toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/app/dashboard']);
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
    currentUserSignal.set(null);
    accessTokenSignal.set(null);

    expect(runGuard('CREATE')).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
  });
});
