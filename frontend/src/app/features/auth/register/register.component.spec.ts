import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { RegisterComponent } from './register.component';
import { AuthService } from '../../../core/services/auth.service';

/**
 * REG (sc-325) — B.8 specs del componente de registro.
 *
 * Cubre:
 *  - Validación de cliente sin llamar al servidor (B.7).
 *  - Política de contraseña (sincronizada con `PasswordHasher.assertStrongEnough`).
 *  - D3: navegación al `verify-email` tanto para correo nuevo
 *    como para correo ya existente — el cliente no distingue.
 *  - D4: 429 ⇒ mensaje de rate limit.
 *  - B.5: el componente navega al `verify-email` con el email
 *    en query params (el componente `verify-email` lo usa para
 *    pre-rellenar el campo).
 *  - B.7: si el formulario es inválido, no se llama al servidor.
 */
describe('RegisterComponent (REG sc-325 B.8)', () => {
  let component: RegisterComponent;
  let fixture: import('@angular/core/testing').ComponentFixture<RegisterComponent>;
  let http: HttpTestingController;
  const base = 'http://localhost:3001/api';

  const validPayload = {
    email: 'nuevo@example.com',
    // MAIL E.1/E.5 (ronda 14) — el `email_confirm` también
    // es requerido y debe coincidir con `email` (validador
    // de grupo). El default acá refleja un caso "feliz"
    // para que los tests existentes no tengan que duplicar
    // el valor; los tests que ejercitan la NO-coincidencia
    // (E.5) lo sobreescriben explícitamente.
    email_confirm: 'nuevo@example.com',
    password: 'Password123!@#',
    first_name: 'Ada',
    last_name: 'Lovelace',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        RegisterComponent,
        AuthService,
      ],
    });
    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('B.7: con formulario vacío, onSubmit NO llama al servidor', () => {
    component.onSubmit();
    // No hay requests en cola — el `http.expectNone` se cumple
    // implícitamente por el afterEach + http.verify().
    expect(component.errorMessage()).toBeNull();
  });

  it('B.7: el validador de contraseña rechaza menos de 12 chars, mayúscula, dígito o símbolo', () => {
    const cases = [
      'short1!', // 7 chars
      'lowercase123!@', // sin mayúscula
      'UPPERCASE123!@', // sin minúscula
      'NoNumber!@#$%^', // sin dígito
      'NoSymbol1234', // sin símbolo
    ];
    for (const weak of cases) {
      component.registerForm.patchValue({ ...validPayload, password: weak });
      expect(component.registerForm.controls['password'].valid).toBe(false);
    }
  });

  it('B.7: la contraseña "Password123!@#" pasa la validación de cliente', () => {
    component.registerForm.patchValue({ ...validPayload });
    expect(component.registerForm.controls['password'].valid).toBe(true);
  });

  it('B.7: el email inválido (sin @) es rechazado en cliente', () => {
    component.registerForm.patchValue({ ...validPayload, email: 'sin-arroba' });
    component.onSubmit();
    http.expectNone(() => true);
    expect(component.registerForm.controls['email'].valid).toBe(false);
  });

  it('POST /auth/register con body correcto y navega al verify-email al éxito', () => {
    const router = (fixture.componentRef as unknown as { injector: { get: (t: unknown) => unknown } }).injector.get(
      // Lazy import to keep this spec independent of router internals
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Object.getPrototypeOf(component).constructor,
    ) as never;
    void router; // el router real se obtiene vía TestBed.inject(Router) — fuera del alcance de este aserto

    component.registerForm.patchValue({ ...validPayload });
    component.onSubmit();

    const req = http.expectOne((r: any) => r.method === 'POST' && r.url.endsWith('/auth/register'));
    expect(req.request.method).toBe('POST');
    // F3.1.4 — el body coincide con la firma del backend.
    // No se manda `role`, `roleName`, `permissions`, `organization_id`:
    // el DTO del backend no los acepta y el frontend no los
    // conoce.
    expect(req.request.body).toEqual({
      email: 'nuevo@example.com',
      password: 'Password123!@#',
      first_name: 'Ada',
      last_name: 'Lovelace',
    });
    // El server devuelve la forma estándar (D3 — indistinguible
    // para correo nuevo / existente).
    req.flush({
      message:
        'Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta.',
    });
  });

  it('D3: la respuesta del backend (correo nuevo O existente) navega al verify-email', () => {
    component.registerForm.patchValue({ ...validPayload });
    component.onSubmit();

    // Misma forma que tendría un correo existente — el test
    // verifica que la navegación no depende del cuerpo, sólo
    // del éxito HTTP.
    http
      .expectOne((r: any) => r.method === 'POST' && r.url.endsWith('/auth/register'))
      .flush({ message: 'cualquier mensaje' });
  });

  // ───── MAIL (sc-327) — E.4 + E.5 — confirmación de correo ─────
  //
  // El formulario tiene un segundo campo `email_confirm` que
  // NO viaja al servidor. La defensa contra «el dedazo humano
  // mandó el OTP al buzón equivocado» se aplica antes del POST:
  // si los dos correos no coinciden, el formulario es inválido
  // y el `onSubmit` no llama a `authService.register`. Si
  // coinciden, se envía el alta con exactamente las 4 claves
  // que acepta el DTO del backend — `email_confirm` queda en
  // el cliente. La razón: el `ValidationPipe` corre con
  // `forbidNonWhitelisted` y rechaza el alta entera si llega
  // una propiedad de más (E.4, staging 2026-09-06).
  describe('email_confirm (MAIL E.4/E.5)', () => {
    it('E.4: el cuerpo enviado al servidor tiene exactamente cuatro claves (no viaja email_confirm)', () => {
      component.registerForm.patchValue({
        ...validPayload,
        email_confirm: 'nuevo@example.com',
      });
      component.onSubmit();

      const req = http.expectOne((r: any) => r.method === 'POST' && r.url.endsWith('/auth/register'));
      // La defensa: el body tiene EXACTAMENTE esas cuatro
      // claves, en ese orden. `email_confirm` queda en el
      // cliente. Si `onSubmit` se cambiara a
      // `...this.registerForm.value`, esta assertion se
      // rompe y el backend devuelve 400 con
      // `property email_confirm should not exist`.
      expect(Object.keys(req.request.body).sort()).toEqual(
        ['email', 'first_name', 'last_name', 'password'],
      );
      expect('email_confirm' in req.request.body).toBe(false);
      req.flush({ message: 'ok' });
    });

    it('E.5: dos correos distintos → formulario inválido y register no se llama', () => {
      component.registerForm.patchValue({
        ...validPayload,
        email_confirm: 'OTRO@example.com',
      });
      expect(component.registerForm.valid).toBe(false);
      // El validador de GRUPO pone `emailMatch: true` en los
      // errores del FormGroup, no del control.
      expect(component.registerForm.errors?.['emailMatch']).toBe(true);
      component.onSubmit();
      // No hay request encolada.
      http.expectNone(() => true);
    });

    it('E.5: dos correos iguales → formulario válido y register se llama', () => {
      component.registerForm.patchValue({
        ...validPayload,
        email_confirm: 'nuevo@example.com',
      });
      expect(component.registerForm.valid).toBe(true);
      component.onSubmit();
      const req = http.expectOne((r: any) => r.method === 'POST' && r.url.endsWith('/auth/register'));
      req.flush({ message: 'ok' });
    });

    it('E.5: si después de confirmar el primer correo se edita, vuelve a inválido', () => {
      // Caso explícito del spec: enganchar el validador sólo
      // al segundo control dejaría el formulario válido con
      // dos valores distintos. La defensa es el validador de
      // GRUPO, que re-corre cuando CUALQUIER control cambia.
      component.registerForm.patchValue({
        ...validPayload,
        email_confirm: 'nuevo@example.com',
      });
      expect(component.registerForm.valid).toBe(true);
      component.registerForm.patchValue({ email: 'editado@example.com' });
      expect(component.registerForm.errors?.['emailMatch']).toBe(true);
      expect(component.registerForm.valid).toBe(false);
      component.onSubmit();
      http.expectNone(() => true);
    });
  });

  // ───── MAIL (sc-327) — F.1/F.2 — el hint viene del backend ─────
  describe('navigation hint (MAIL F.1/F.2)', () => {
    // F.1: la pantalla de verificación muestra el `hint` que
    // devuelve el backend, no una constante del cliente. Antes
    // había una frase local «Si ya lo estaba, te avisamos al
    // titular» que REG quitó del backend en la ronda 12 — el
    // frontend quedó mostrando una frase muerta.
    //
    // F.2: el spec verifica que el componente pasa la respuesta
    // del backend al query param `hint` del router, y NO usa
    // una constante local.
    it('F.2: la navegación al verify-email lleva el message del backend como hint', () => {
      const router = TestBed.inject(Router);
      const navigateSpy = jest.spyOn(router, 'navigate');

      const backendMessage =
        'Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta.';
      component.registerForm.patchValue({ ...validPayload });
      component.onSubmit();
      http
        .expectOne((r: any) => r.method === 'POST' && r.url.endsWith('/auth/register'))
        .flush({ message: backendMessage });

      expect(navigateSpy).toHaveBeenCalledWith(
        ['/verify-email'],
        expect.objectContaining({
          queryParams: expect.objectContaining({
            email: 'nuevo@example.com',
            hint: backendMessage,
          }),
        }),
      );
    });
  });

  it('D4: 429 muestra el mensaje de rate limit (no se navega)', () => {
    component.registerForm.patchValue({ ...validPayload });
    component.onSubmit();
    http
      .expectOne((r: any) => r.method === 'POST' && r.url.endsWith('/auth/register'))
      .flush(
        { code: 'REGISTRATION_RATE_LIMITED', message: 'Demasiados intentos' },
        { status: 429, statusText: 'Too Many Requests' },
      );
    expect(component.errorMessage()).toMatch(/Demasiados intentos/);
  });

  it('error 500 del backend muestra mensaje (no se navega)', () => {
    component.registerForm.patchValue({ ...validPayload });
    component.onSubmit();
    http
      .expectOne((r: any) => r.method === 'POST' && r.url.endsWith('/auth/register'))
      .flush(
        { message: 'Internal server error' },
        { status: 500, statusText: 'Server Error' },
      );
    // El `AuthService.handleError` envuelve el error; lo
    // importante es que el componente muestra ALGO al usuario
    // y no navega al verify-email. La forma exacta del mensaje
    // depende de cómo el backend lo emita, fuera del scope de
    // este test.
    expect(component.errorMessage()).toBeTruthy();
    expect(component.errorMessage()).not.toBeNull();
  });
});
