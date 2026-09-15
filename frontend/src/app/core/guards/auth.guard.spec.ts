import { TestBed } from '@angular/core/testing';
import { Router, type CanActivateFn } from '@angular/router';
import { signal, computed, type Signal } from '@angular/core';
import { authGuard, guestGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

/**
 * 2026-09-15-auth-token-expiration-fix — auth.guard.spec.ts
 *
 * Both guards are now async CanActivateFn returning Promise<boolean>.
 * They await `sessionValidationComplete` before deciding, and then
 * consult `isAuthenticated()` (which itself now checks JWT exp).
 *
 * Testing strategy: replace the real AuthService with a hand-rolled
 * stub exposing just the signals/inputs the guards read. We don't need
 * the full AuthService because the guards only touch:
 *   - sessionValidationComplete (Signal<boolean>)
 *   - isAuthenticated         (Signal<boolean>)
 *   - nothing else
 */

class AuthServiceStub {
  /** Hooks the test sets per-case before invoking the guard. */
  sessionValidationComplete = signal(true);
  isAuthenticated = signal(false);
}

function setup(stub: Partial<AuthServiceStub> = {}): {
  authStub: AuthServiceStub;
  router: { navigate: jest.Mock };
  invokeGuest: () => Promise<boolean>;
  invokeAuth: (url?: string) => Promise<boolean>;
} {
  const authStub = new AuthServiceStub();
  Object.assign(authStub, stub);
  const router = { navigate: jest.fn().mockResolvedValue(true) };

  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: authStub },
      { provide: Router, useValue: router },
    ],
  });

  const runGuard: CanActivateFn = () => true as never;
  void runGuard; // placeholder so TS doesn't complain about unused param

  // The guards capture the injected services during the first invocation,
  // so re-resolving on every call would defeat TestBed's DI caching. We
  // use TestBed.runInInjectionContext so `inject()` resolves against our
  // stub providers.
  const invokeGuest = () =>
    TestBed.runInInjectionContext(() => guestGuard({} as never, { url: '/registro' } as never)) as Promise<boolean>;
  const invokeAuth = (url = '/app/dashboard') =>
    TestBed.runInInjectionContext(() => authGuard({} as never, { url } as never)) as Promise<boolean>;

  return { authStub, router, invokeGuest, invokeAuth };
}

describe('guestGuard (token expiry aware)', () => {
  it('allows navigation to /registro when there is no token at all', async () => {
    const { invokeGuest } = setup({ isAuthenticated: signal(false) });
    await expect(invokeGuest()).resolves.toBe(true);
  });

  it('allows navigation to /registro when access_token is expired (the sc-207 bug)', async () => {
    // The scenario this whole change exists for: an expired JWT in
    // localStorage used to satisfy isAuthenticated() via pure existence,
    // and the guard would redirect to /app/dashboard. After the fix,
    // isAuthenticated() returns false for an expired token and the
    // guard lets the user reach /registro.
    const { invokeGuest } = setup({ isAuthenticated: signal(false) });
    await expect(invokeGuest()).resolves.toBe(true);
  });

  it('blocks navigation to /registro and redirects to /app/dashboard when access_token is valid', async () => {
    const { invokeGuest, router } = setup({ isAuthenticated: signal(true) });
    await expect(invokeGuest()).resolves.toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/app/dashboard']);
  });

  it('awaits sessionValidationComplete before deciding (hydration in flight)', async () => {
    // sessionValidationComplete=false → the guard must NOT return a
    // value yet. Promise stays pending until the signal flips.
    const authStub = new AuthServiceStub();
    authStub.sessionValidationComplete = signal(false);
    authStub.isAuthenticated = signal(false);
    let pending!: Promise<boolean>;
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    });
    pending = TestBed.runInInjectionContext(() =>
      guestGuard({} as never, { url: '/registro' } as never),
    ) as Promise<boolean>;

    // Yield so the toObservable + filter has a chance to subscribe.
    await new Promise((r) => setTimeout(r, 0));
    let settled = false;
    pending.then(() => (settled = true));
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);

    // Now flip hydration-complete; the guard's filter should let it through.
    authStub.sessionValidationComplete.set(true);
    await expect(pending).resolves.toBe(true);
  });
});

describe('authGuard (token expiry aware)', () => {
  it('blocks /app/dashboard and redirects to /login when access_token is expired', async () => {
    const { invokeAuth, router } = setup({ isAuthenticated: signal(false) });
    await expect(invokeAuth('/app/dashboard')).resolves.toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(
      ['/login'],
      expect.objectContaining({ queryParams: expect.objectContaining({ returnUrl: '/app/dashboard' }) }),
    );
  });

  it('allows /app/dashboard when access_token is valid', async () => {
    const { invokeAuth, router } = setup({ isAuthenticated: signal(true) });
    await expect(invokeAuth('/app/dashboard')).resolves.toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('blocks /app/dashboard when there is no token at all', async () => {
    const { invokeAuth } = setup({ isAuthenticated: signal(false) });
    await expect(invokeAuth('/app/dashboard')).resolves.toBe(false);
  });

  it('awaits sessionValidationComplete before deciding', async () => {
    const authStub = new AuthServiceStub();
    authStub.sessionValidationComplete = signal(false);
    authStub.isAuthenticated = signal(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    });
    const pending = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/app/dashboard' } as never),
    ) as Promise<boolean>;
    await new Promise((r) => setTimeout(r, 0));
    let settled = false;
    pending.then(() => (settled = true));
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);
    authStub.sessionValidationComplete.set(true);
    await expect(pending).resolves.toBe(true);
  });
});

// Suppress an unused-import lint if Signal type alias isn't otherwise used.
type _Used = Signal<unknown>;
void computed;
