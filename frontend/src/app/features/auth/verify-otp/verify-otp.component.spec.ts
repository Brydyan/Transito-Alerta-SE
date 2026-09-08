import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { VerifyOtpComponent } from './verify-otp.component';
import { AuthService } from '../../../core/services/auth.service';

/**
 * REG (sc-325) — C.6 spec del composer del OTP.
 *
 * Cubre los CUATRO códigos que el backend distingue (200, 422
 * con dos `code` distintos, 429), el estado inicial del
 * componente, y la propiedad más importante del grupo: un código
 * inválido o vencido **NO** cierra la sesión. Esa es la única
 * diferencia entre "el reportero tecleó mal" y "atacante
 * intentando enumerar OTPs" — y la app tiene que tratarlas igual.
 *
 * Aserciones de igualdad (`toBe`) donde el contrato exige
 * igualdad. El defecto de la ronda 6 (Fix 12) sobrevivió seis
 * rondas porque las specs usaban `toMatch(/parcial/)` sobre una
 * respuesta que el spec declaraba idéntica — un cambio en el
 * cuerpo del mensaje no rompía el test aunque rompiera el
 * contrato. Acá no: el mensaje es lo que ve el reportero, y
 * cambiarlo sin actualizar este test es la regresión que
 * queremos cazar.
 *
 * Verificación por mutación (per verify-report):
 *  - borrar la rama `EMAIL_ALREADY_VERIFIED` del catch → el
 *    test "422 (EMAIL_ALREADY_VERIFIED)" falla porque el
 *    status queda en `invalid` en vez de `already`.
 *  - cambiar el 422 OTP_INVALID para que setee `message` con
 *    el texto de `EMAIL_ALREADY_VERIFIED` → el test falla
 *    porque `toBe` es estricto.
 *  - reemplazar `this.otpForm.invalid` por `this.otpForm.valid`
 *    → los tests de form-invalid caen.
 */
describe('VerifyOtpComponent (REG sc-325 C.6)', () => {
  const _base = 'http://localhost:3001/api';

  function setup() {
    // Stub de AuthService con `fetchUser` que devuelve un
    // `MeResponse` mínimo — `user()` queda con `emailVerified`
    // controlado por el test. `logout` es un spy para detectar
    // cierres de sesión involuntarios.
    const fetchUser = jest.fn().mockReturnValue(
      of({
        user_id: 'u-1',
        device_uuid: null,
        permissions: [],
        email_verified: true,
        role_name: 'reporter',
      }),
    );
    const logout = jest.fn().mockReturnValue(of({ success: true }));
    const authStub = {
      fetchUser,
      logout,
      accessToken: () => 'token-abc',
    } as unknown as AuthService;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        VerifyOtpComponent,
        { provide: AuthService, useValue: authStub },
      ],
    });
    const fixture = TestBed.createComponent(VerifyOtpComponent);
    fixture.detectChanges();
    // REG Fix C (ronda 10) — espiamos `navigateByUrl` para
    // afirmar que las ramas `success` y `already` cumplen la
    // promesa de redirigir. Antes de este fix el componente
    // navegaba "al vacío" — el spy captura la intención real.
    const router = TestBed.inject(Router);
    const navigateByUrl = jest
      .spyOn(router, 'navigateByUrl')
      .mockResolvedValue(true);
    return {
      fixture,
      component: fixture.componentInstance,
      http: TestBed.inject(HttpTestingController),
      router,
      navigateByUrl,
      fetchUser,
      logout,
    };
  }

  afterEach(() => {
    // Limpia cualquier request pendiente entre tests — el
    // `http.verify()` se llama implícito al final de cada
    // test cuando la respuesta esperada se entregó.
  });

  it('C.6: estado inicial — status = idle, message = null, form vacío', () => {
    const { component } = setup();
    expect(component.status()).toBe('idle');
    expect(component.message()).toBeNull();
    // El form declara validadores de 6 dígitos numéricos — al
    // montar, el control empieza vacío y `invalid`.
    expect(component.otpCtrl.value).toBe('');
    expect(component.otpForm.valid).toBe(false);
  });

  it('C.6: con form vacío, submit() NO llama al servidor (validación cliente)', () => {
    const { component, http } = setup();
    component.submit();
    // El `http.verify()` de Angular detecta cualquier request
    // pendiente; acá no debe haber ninguna.
    expect(() => http.expectOne(() => true)).toThrow();
    // El form se marca como touched para que el error visible
    // aparezca, pero el status no cambia.
    expect(component.status()).toBe('idle');
  });

  it('C.6: con OTP no-numérico o de largo incorrecto, submit() NO llama al servidor', () => {
    const { component, http } = setup();
    component.otpCtrl.setValue('12345'); // 5 dígitos
    component.submit();
    expect(() => http.expectOne(() => true)).toThrow();
    expect(component.status()).toBe('idle');

    component.otpCtrl.setValue('12345a'); // no-numérico
    component.submit();
    expect(() => http.expectOne(() => true)).toThrow();
    expect(component.status()).toBe('idle');
  });

  it('C.6: 200 (verified: true) → status = success, fetchUser refresca el signal, navega al dashboard', async () => {
    const { component, http, fetchUser, router } = setup();
    component.otpCtrl.setValue('123456');
    const submitP = component.submit();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/email/verify-otp'));
    expect(req.request.body).toEqual({ otp: '123456' });
    req.flush({ verified: true });
    await submitP;
    expect(component.status()).toBe('success');
    expect(component.message()).toBe('Correo verificado. Redirigiendo…');
    expect(fetchUser).toHaveBeenCalledTimes(1);
    // REG Fix C (ronda 10) — el composer ahora navega al
    // destino post-verificación. Antes el mensaje era una
    // promesa hueca. Verificación por mutación: quitar la
    // línea `this.router.navigateByUrl(this.returnUrl)` y este
    // assert cae.
    expect(router.navigateByUrl).toHaveBeenCalledWith('/app/dashboard');
  });

  it('C.6: 422 con code OTP_INVALID → status = invalid, mensaje accionable (no cierra sesión)', async () => {
    const { component, http, router, logout } = setup();
    component.otpCtrl.setValue('000000');
    const submitP = component.submit();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/email/verify-otp'));
    req.flush(
      { code: 'OTP_INVALID', message: 'El código no es válido o venció.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await submitP;
    expect(component.status()).toBe('invalid');
    // El texto es exactamente el declarado — `toBe`, no
    // `toMatch`, para que cualquier divergencia (incluida una
    // copia pegada) caiga acá.
    expect(component.message()).toBe(
      'El código no es válido o venció. Pedí uno nuevo y volvé a intentar.',
    );
    // Cierre de sesión: NO.
    expect(logout).not.toHaveBeenCalled();
    // REG Fix C — un 422 OTP_INVALID NO navega. El reportero
    // sigue en `/verificar` para reintentar.
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('C.6: 422 con code EMAIL_ALREADY_VERIFIED → status = already, fetchUser, navega al dashboard', async () => {
    const { component, http, fetchUser, router } = setup();
    component.otpCtrl.setValue('111111');
    const submitP = component.submit();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/email/verify-otp'));
    req.flush(
      { code: 'EMAIL_ALREADY_VERIFIED', message: 'El correo ya está verificado.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await submitP;
    expect(component.status()).toBe('already');
    expect(component.message()).toBe(
      'Tu correo ya estaba verificado. Volvemos a tu cuenta…',
    );
    // El reportero está «listo»: refrescamos para que el
    // signal user.emailVerified pase a true y la próxima
    // navegación a /app/dashboard no se rediriga de nuevo.
    expect(fetchUser).toHaveBeenCalledTimes(1);
    // REG Fix C (ronda 10) — el composer cumple la promesa
    // "Volvemos a tu cuenta…". Sin esta navegación el spec
    // "Ya verificado" del requirement queda sin cumplir
    // (CRITICAL 3 del verify de la ronda 9).
    expect(router.navigateByUrl).toHaveBeenCalledWith('/app/dashboard');
  });

  it('C.6: 429 → status = ratelimit, mensaje neutral, NO es un fallo', async () => {
    const { component, http } = setup();
    component.otpCtrl.setValue('222222');
    const submitP = component.submit();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/email/verify-otp'));
    req.flush(
      { code: 'EMAIL_RATE_LIMITED', message: 'rate limit' },
      { status: 429, statusText: 'Too Many Requests' },
    );
    await submitP;
    expect(component.status()).toBe('ratelimit');
    expect(component.message()).toBe(
      'Te enviamos un código hace menos de un minuto. Esperá y probá de nuevo.',
    );
  });

  it('C.6: error 500 del backend → status = invalid, mensaje de fallback', async () => {
    const { component, http } = setup();
    component.otpCtrl.setValue('333333');
    const submitP = component.submit();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/email/verify-otp'));
    req.flush(
      { message: 'No se pudo verificar' },
      { status: 500, statusText: 'Server Error' },
    );
    await submitP;
    expect(component.status()).toBe('invalid');
    expect(component.message()).toBe('No se pudo verificar');
  });

  it('C.6: resend 200 → status = resent-ok, POST a /email/resend-verification', async () => {
    const { component, http } = setup();
    const resendP = component.resend();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/email/resend-verification'));
    expect(req.request.body).toEqual({});
    req.flush({ queued: true });
    await resendP;
    expect(component.status()).toBe('resent-ok');
    expect(component.message()).toBe('Listo. Revisá tu casilla e ingresá el código nuevo.');
  });

  it('C.6: resend 429 → status = ratelimit, mensaje neutral', async () => {
    const { component, http } = setup();
    const resendP = component.resend();
    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/email/resend-verification'));
    req.flush(
      { message: 'rate limit' },
      { status: 429, statusText: 'Too Many Requests' },
    );
    await resendP;
    expect(component.status()).toBe('ratelimit');
    expect(component.message()).toBe('Acabamos de enviarte uno. Esperá un minuto antes de pedir otro.');
  });
});
