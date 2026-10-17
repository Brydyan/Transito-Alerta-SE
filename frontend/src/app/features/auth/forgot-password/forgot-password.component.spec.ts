import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { ForgotPasswordComponent } from './forgot-password.component';
import { AuthService } from '../../../core/services/auth.service';

/**
 * 2026-10-16-forgot-reset-password-flow — el componente reemplaza
 * el wrapper vanilla JS anterior (`forgot-password.component.js`)
 * que no estaba registrado en `app.routes.ts`. Esta cobertura
 * valida:
 *  - email vacío → no llama al servicio
 *  - submit con email válido → invoca `AuthService.requestPasswordReset`
 *  - éxito → muestra mensaje inline (no toast — el patrón del
 *    proyecto es inline en el form)
 *  - error → muestra mensaje de error
 */
describe('ForgotPasswordComponent (2026-10-16)', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let mockAuthService: { requestPasswordReset: jest.Mock };

  function setup() {
    mockAuthService = {
      requestPasswordReset: jest.fn().mockReturnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        ForgotPasswordComponent,
        { provide: AuthService, useValue: mockAuthService },
      ],
    });
    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, component };
  }

  it('email vacío: no llama al servicio y muestra error', () => {
    const { component } = setup();
    component.forgotForm.patchValue({ email: '' });
    component.onSubmit();
    expect(mockAuthService.requestPasswordReset).not.toHaveBeenCalled();
    // El form es inválido → `submitted` se setea pero el submit
    // early-return sin llamar al servicio. `errorMessage` queda
    // null (la validación corre vía Angular forms).
    expect(component.submitted()).toBe(true);
  });

  it('email con formato inválido: no llama al servicio', () => {
    const { component } = setup();
    component.forgotForm.patchValue({ email: 'not-an-email' });
    component.onSubmit();
    expect(mockAuthService.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('submit con email válido: llama requestPasswordReset una sola vez con el email', () => {
    const { component } = setup();
    component.forgotForm.patchValue({ email: 'maria@x.com' });
    component.onSubmit();
    expect(mockAuthService.requestPasswordReset).toHaveBeenCalledWith(
      'maria@x.com',
    );
    expect(mockAuthService.requestPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('éxito: muestra mensaje inline (success=true, loading=false)', () => {
    const { component } = setup();
    component.forgotForm.patchValue({ email: 'maria@x.com' });
    component.onSubmit();
    expect(component.success()).toBe(true);
    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBeNull();
  });

  it('error del servicio: muestra errorMessage y libera loading', () => {
    mockAuthService = {
      requestPasswordReset: jest.fn().mockReturnValue(
        throwError(() => new Error('Network down')),
      ),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        ForgotPasswordComponent,
        { provide: AuthService, useValue: mockAuthService },
      ],
    });
    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.forgotForm.patchValue({ email: 'maria@x.com' });
    component.onSubmit();
    expect(component.success()).toBe(false);
    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBeTruthy();
  });

  it('muestra el heading "¿Olvidaste tu contraseña?" + subtítulo', () => {
    const { fixture } = setup();
    const html = fixture.nativeElement.textContent ?? '';
    expect(html).toContain('¿Olvidaste tu contraseña?');
    expect(html).toContain('No te preocupes. Te enviaremos un enlace seguro a tu correo.');
  });
});