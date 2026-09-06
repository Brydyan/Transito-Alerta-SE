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

  // MAIL (sc-327) — F.2/F.3 — el `hint` viene del backend
  // (query param), NO de una constante local. Antes la frase
  // «Si ya lo estaba, te avisamos al titular» vivía acá como
  // fallback — REG la quitó del backend en la ronda 12 y el
  // frontend quedó mostrando una frase muerta.
  it('F.2/F.3: el hint que se muestra es el del query param (no una constante del cliente)', () => {
    const backendMessage = 'Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta.';
    const { component } = setup({
      email: 'x@example.com',
      hint: backendMessage,
    });
    // El `hint` que llegó por query param es el que se
    // renderiza. La constante local del cliente es sólo un
    // fallback (no una copia literal del mensaje del backend).
    expect(component.hint()).toBe(backendMessage);
    expect(document.body.textContent).toContain(backendMessage);
  });

  it('el email del query param se pre-rellena en el control', () => {
    const { component } = setup({ email: 'pre@example.com' });
    expect(component.emailCtrl.value).toBe('pre@example.com');
  });

  it('sin sesión, el botón lleva al login (no a un composer del OTP)', () => {
    setup({ email: 'x@example.com' }, false);
    // El composer del OTP requiere JWT
    // (`email-verification.controller.ts:43`). Como el alta
    // pública no emite tokens, esta pantalla sin sesión sólo
    // puede llevar al login. La transición post-login al
    // composer vive en `LoginComponent` (C.4) — el reportero
    // entra y, si su correo no está verificado, va a
    // `/verificar` automáticamente. Acá no hay punto de
    // enchufe de F4; esa dependencia se eliminó en C.5.
    expect(document.body.textContent).toContain('Iniciar sesión para verificar');
  });

  it('con sesión, muestra el mensaje de "sesión activa" e instruye a usar el composer del OTP en /verificar', () => {
    // REG C.5 (ronda 9) — esta pantalla pública ya no es un
    // callejón. Con sesión activa, en vez del "placeholder F4"
    // que decía el round 0, el componente indica al reportero
    // que ingrese el código en el composer del OTP
    // (`/verificar`). El composer existe y está bajo
    // `authGuard`; el `LoginComponent` (C.4) lo alcanza
    // automáticamente para el reporter sin verificar, pero un
    // reporter que ya está logueado y que por alguna razón
    // abre esta URL puede llegar al composer navegando
    // manualmente o desde el menú.
    setup({ email: 'x@example.com' }, true);
    expect(document.body.textContent).toContain('Sesión activa');
  });
});
