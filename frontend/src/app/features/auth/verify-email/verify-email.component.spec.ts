import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { VerifyEmailComponent } from './verify-email.component';
import { AuthService } from '../../../core/services/auth.service';

/**
 * REG (sc-325) — Fix 9 (ronda 6): el destino de
 * `register.component.ts:onSubmit` ahora existe como ruta Y
 * como componente. El defecto de B.6 fue que la casilla se
 * marcó cuando sólo había un `.html` heredado de sc-117 — sin
 * `.ts`, sin decorador, sin que ningún import lo compilara.
 *
 * Verificación por mutación (per verify-report):
 *  1. borrar la ruta de `app.routes.ts` → el spec de la sección
 *     `app.routes.verify-email.spec.ts` debe fallar.
 *  2. quitar el `loadComponent` de la ruta → el build de Angular
 *     cae.
 */
describe('VerifyEmailComponent (REG sc-325 Fix 9)', () => {
  function setup(qp: Record<string, string> = {}, isAuthenticated: boolean = false) {
    const authStub = { isAuthenticated: () => isAuthenticated } as unknown as AuthService;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(qp) },
            queryParamMap: of(convertToParamMap(qp)),
          },
        },
        { provide: AuthService, useValue: authStub },
      ],
    });
    const fixture = TestBed.createComponent(VerifyEmailComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, component };
  }

  it('existe el componente y se monta sin errores con query params', () => {
    setup({ email: 'ciudadano@example.com', hint: 'algo' });
    // El correo se renderiza en el `value` del input, no en
    // `textContent`. Por eso `textContent` no lo contiene: el
    // test del control unitario (siguiente caso) verifica que el
    // FormControl se pre-rellenó.
    const input = document.querySelector('[data-testid="email-input"]') as HTMLInputElement | null;
    expect(input?.value).toBe('ciudadano@example.com');
  });

  it('el email del query param se pre-rellena en el control', () => {
    const { component } = setup({ email: 'pre@example.com' });
    expect(component.emailCtrl.value).toBe('pre@example.com');
  });

  it('sin sesión, el botón lleva al login (no a un composer del OTP)', () => {
    setup({ email: 'x@example.com' }, false);
    // El composer del OTP requiere JWT (T6.5.D,
    // email-verification.controller.ts:43). Como el alta
    // pública no emite tokens, esta pantalla sin sesión sólo
    // puede llevar al login. El composer entra en F4 con un
    // punto de enchufe claro.
    expect(document.body.textContent).toContain('Iniciar sesión para verificar');
  });

  it('con sesión, muestra el mensaje de "sesión activa" (composer queda como placeholder F4)', () => {
    setup({ email: 'x@example.com' }, true);
    expect(document.body.textContent).toContain('Sesión activa');
  });
});
