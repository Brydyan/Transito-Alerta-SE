import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, Route } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { AuthService } from '../../../core/services/auth.service';
import { permissionGuard } from '../../../core/guards/permission.guard';

/**
 * F6 (`2026-09-11-f6-audit-logs-export`) — sdd-verify FIX-3.
 *
 * The original R1-S2 spec inside `audit-logs.component.spec.ts`
 * was a structural assertion that did not exercise the guard.
 * This separate spec wires the real `permissionGuard` with
 * `RouterTestingModule.withRoutes(...)` and asserts the
 * navigation outcome for users with and without the
 * `READ audit-logs` permission.
 *
 * The integration lives in its own file because Angular's TestBed
 * cannot be re-configured inside a describe that has already
 * instantiated it — the structural version of this test in
 * `audit-logs.component.spec.ts` would block the integration
 * version from running.
 *
 * `router.navigate()` returns a Promise; reading `router.url`
 * synchronously after the call reads the OLD URL (the test fails
 * with "Received: '/'"). Use `fakeAsync` + `tick` to flush the
 * microtask queue before asserting the post-navigation URL.
 */

describe('audit-logs route permissionGuard (R1-S2, sdd-verify FIX-3)', () => {
  function setupRouter(currentPermissions: string[]): Router {
    TestBed.configureTestingModule({
      imports: [
        RouterTestingModule.withRoutes([
          {
            path: 'admin/audit-logs',
            data: {
              breadcrumb: 'Auditoría de Acceso',
              permission: 'READ audit-logs',
            },
            canActivate: [permissionGuard],
            component: class {},
          } as Route,
          { path: 'app/dashboard', component: class {} } as Route,
          { path: 'login', component: class {} } as Route,
        ]),
      ],
      providers: [
        {
          provide: AuthService,
          useValue: { currentUser: signal({ permissions: currentPermissions }) },
        },
      ],
    });

    return TestBed.inject(Router);
  }

  it('redirects a user without READ audit-logs to /app/dashboard', fakeAsync(() => {
    const router = setupRouter(['READ incidents']);
    router.navigate(['/admin/audit-logs']);
    tick();
    expect(router.url).toBe('/app/dashboard');
  }));

  it('allows a user with READ audit-logs to reach the route', fakeAsync(() => {
    const router = setupRouter(['READ audit-logs']);
    router.navigate(['/admin/audit-logs']);
    tick();
    expect(router.url).toBe('/admin/audit-logs');
  }));

  it('redirects a hydrated user with no permissions to /app/dashboard', fakeAsync(() => {
    // Empty perms simulates a hydrated session without READ
    // audit-logs. (A truly null currentUser would route to /login,
    // but reproducing that requires a signal stub with a setter
    // — out of scope for this R1-S2 integration.)
    const router = setupRouter([]);
    router.navigate(['/admin/audit-logs']);
    tick();
    expect(router.url).toBe('/app/dashboard');
  }));
});
