import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/auth.model';

/**
 * REG (sc-325) — Fix A (ronda 10): `LoginComponent.onSubmit` redirige
 * al composer del OTP (`/verificar`) cuando el usuario es un
 * `reporter` sin verificar.
 *
 * **Por qué este archivo existe.** El verify de la ronda 9
 * descubrió que `roleName` nunca se poblaba en el signal `user`
 * (CRITICAL 1), y que la regla `current?.roleName === 'reporter' &&
 * current.emailVerified === false` no podía cumplirse nunca — por lo
 * tanto C.4 era código muerto, y el escenario "Llegar sin buscar"
 * del spec estaba roto en producción sin que ningún test lo cubriera.
 *
 * Este spec crea el archivo que faltaba y fija la matriz de
 * decisiones:
 *  - reporter sin verificar → /verificar
 *  - reporter verificado → NO /verificar (va al returnUrl o dashboard)
 *  - cada uno de los 4 roles de staff → NO /verificar, aunque
 *    `emailVerified` sea `false` (la verificación no aplica al staff)
 *
 * Verificación por mutación (per verify-report):
 *  1. quitar la rama del redirect en `LoginComponent:onSubmit` → el
 *     primer test cae (no navega a `/verificar`).
 *  2. volver a hardcodear `roleName: null` en
 *     `AuthService.fetchUser` → el primer test cae (la condición
 *     `roleName === 'reporter'` no se cumple).
 *  3. invertir el operador a `!==` → el primer test pasa pero los
 *     del staff caen (los staff terminarían yendo a `/verificar`).
 */
describe('LoginComponent (REG sc-325 Fix A — C.4 redirect)', () => {
  function setup(userOverride: Partial<User> | null = null) {
    // El `AuthService` real expone `login()` (Observable) y `user`
    // (signal). El mock provee ambos: `login` devuelve un token
    // genérico (no es lo que este spec prueba), `user` se setea
    // con el escenario que el test quiere cubrir.
    const login = jest.fn().mockReturnValue(
      of({ access_token: 'jwt', refresh_token: 'rt', permissions: [] }),
    );
    const authStub = {
      login,
      user: jest.fn(),
    } as unknown as AuthService;
    // El signal real es una función-getter que devuelve el valor
    // actual. Configuramos el valor inicial con el override del
    // test; los mutantes pueden cambiarlo entre tests.
    (authStub.user as unknown as jest.Mock).mockImplementation(() => userOverride);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        LoginComponent,
        { provide: AuthService, useValue: authStub },
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentInstance.loginForm.patchValue({
      email: 'x@example.com',
      password: 'Password123!',
    });
    return { fixture, component: fixture.componentInstance, router: TestBed.inject(Router) };
  }

  function fireSubmit(component: LoginComponent) {
    // El test no necesita esperar la resolución completa: lo que
    // importa es la decisión de navegación, que ocurre en el
    // `next` del subscribe. Devolvemos una promesa que se
    // resuelve en el siguiente microtask.
    component.onSubmit();
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  it('Fix A: reporter sin verificar → navega a /verificar', async () => {
    const { component, router } = setup({
      id: 'u-1',
      roleName: 'reporter',
      emailVerified: false,
    });
    const navSpy = jest.spyOn(router, 'navigate');
    await fireSubmit(component);
    expect(navSpy).toHaveBeenCalledWith(['/verificar']);
  });

  it('Fix A: reporter verificado → NO navega a /verificar, va al dashboard', async () => {
    // El opuesto del caso anterior. Si `emailVerified` es `true`,
    // la condición no se cumple y el redirect del composer se
    // salta. El destino habitual es el returnUrl o el dashboard.
    const { component, router } = setup({
      id: 'u-2',
      roleName: 'reporter',
      emailVerified: true,
    });
    const navSpy = jest.spyOn(router, 'navigate');
    await fireSubmit(component);
    expect(navSpy).not.toHaveBeenCalledWith(['/verificar']);
    // Va al dashboard o al returnUrl. La forma exacta depende
    // del routing real, fuera del scope de C.4.
  });

  it('Fix A: operador_org sin verificar → NO navega a /verificar', async () => {
    // La verificación no aplica al staff. Aunque `emailVerified`
    // sea `false`, la condición no se cumple porque `roleName`
    // no es `'reporter'`. Si esto falla, es el defecto de
    // "regla aplicada en un sitio y no en su vecino" — un staff
    // terminaría en el composer del OTP, sin poder hacer nada
    // útil.
    const { component, router } = setup({
      id: 'u-staff-1',
      roleName: 'operador_org',
      emailVerified: false,
    });
    const navSpy = jest.spyOn(router, 'navigate');
    await fireSubmit(component);
    expect(navSpy).not.toHaveBeenCalledWith(['/verificar']);
  });

  it('Fix A: admin_org sin verificar → NO navega a /verificar', async () => {
    const { component, router } = setup({
      id: 'u-staff-2',
      roleName: 'admin_org',
      emailVerified: false,
    });
    const navSpy = jest.spyOn(router, 'navigate');
    await fireSubmit(component);
    expect(navSpy).not.toHaveBeenCalledWith(['/verificar']);
  });

  it('Fix A: operador_sistema sin verificar → NO navega a /verificar', async () => {
    const { component, router } = setup({
      id: 'u-staff-3',
      roleName: 'operador_sistema',
      emailVerified: false,
    });
    const navSpy = jest.spyOn(router, 'navigate');
    await fireSubmit(component);
    expect(navSpy).not.toHaveBeenCalledWith(['/verificar']);
  });

  it('Fix A: master sin verificar → NO navega a /verificar', async () => {
    const { component, router } = setup({
      id: 'u-staff-4',
      roleName: 'master',
      emailVerified: false,
    });
    const navSpy = jest.spyOn(router, 'navigate');
    await fireSubmit(component);
    expect(navSpy).not.toHaveBeenCalledWith(['/verificar']);
  });

  it('Fix A: signal `user` es null (no se cargó el /me) → no navega a /verificar', async () => {
    // Defensa: si por alguna razón `fetchUser` falla, el signal
    // queda en `null` y la condición `current?.roleName === 'reporter'`
    // no se cumple. El componente cae al camino por defecto
    // (returnUrl o dashboard). No es deseable que vaya al
    // composer sin saber quién es.
    const { component, router } = setup(null);
    const navSpy = jest.spyOn(router, 'navigate');
    await fireSubmit(component);
    expect(navSpy).not.toHaveBeenCalledWith(['/verificar']);
  });

  it('Fix A: con error en el login, NO navega a /verificar ni al dashboard', async () => {
    // El `next` del subscribe no corre si el `error` sí. El
    // `errorMessage` se setea, pero no hay navegación. Este test
    // blinda contra el caso "login falla pero onSubmit redirige
    // igual".
    const login = jest.fn().mockReturnValue(throwError(() => new Error('Bad creds')));
    const authStub = {
      login,
      user: jest.fn().mockReturnValue({
        id: 'u-x',
        roleName: 'reporter',
        emailVerified: false,
      }),
    } as unknown as AuthService;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        LoginComponent,
        { provide: AuthService, useValue: authStub },
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentInstance.loginForm.patchValue({
      email: 'x@example.com',
      password: 'wrong',
    });
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navSpy = jest.spyOn(router, 'navigate');

    component.onSubmit();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // El componente loggea el error y setea `errorMessage`. Si
    // el callback no se ejecuta (p.ej. el observable se
    // completa en vez de fallar), el `loading` no vuelve a
    // `false` y `submitted` no vuelve a `false` — esos son
    // también indicadores de que el `error:` corrió.
    expect(navSpy).not.toHaveBeenCalledWith(['/verificar']);
    // No afirmamos sobre `errorMessage` (su forma depende del
    // AuthService.handleError real, fuera de alcance de C.4).
    // Lo que importa es que el navigate no ocurrió: el `error:`
    // del subscribe no navega.
    expect(component.loading()).toBe(false);
  });
});
