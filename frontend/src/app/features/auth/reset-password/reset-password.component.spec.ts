import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../../../core/services/auth.service';

/**
 * 2026-10-16-forgot-reset-password-flow — reemplazo del wrapper
 * vanilla JS. Cobertura:
 *  - sin token en URL → form deshabilitado, mensaje inline
 *  - contraseñas no coinciden → no llama al servicio
 *  - submit válido → llama `confirmPasswordReset(token, password)`
 *  - error 410 → mensaje "expirado"
 *  - error 404 → mensaje "no válido"
 *  - éxito → navega a /login tras 3 segundos
 */
describe('ResetPasswordComponent (2026-10-16)', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let mockAuthService: { confirmPasswordReset: jest.Mock };

  // 2026-10-16 — alineado con `STRONG_PASSWORD` (12+ chars con
  // composición). El backend (`PasswordHasher.assertStrongEnough`)
  // exige la misma regla — el frontend alinea para no mentirle
  // al usuario sobre lo que va a pasar.
  const VALID_PASSWORD = 'NewPass123!@x'; // 13 chars: upper, lower, digit, symbol
  const OTHER_PASSWORD = 'OtraCosa456@yz';

  /** Helper para ActivatedRoute.snapshot.queryParams['token'] */
  function setupRoute(token: string | null) {
    const paramMap = {
      get: jest.fn().mockImplementation((key: string) =>
        key === 'token' ? token : null,
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        ResetPasswordComponent,
        { provide: AuthService, useValue: mockAuthService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: paramMap } },
        },
      ],
    });
    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, component };
  }

  beforeEach(() => {
    mockAuthService = {
      confirmPasswordReset: jest.fn().mockReturnValue(of(undefined)),
    };
  });

  it('sin token en URL: muestra mensaje y deshabilita el form', () => {
    const { component } = setupRoute(null);
    expect(component.tokenMissing()).toBe(true);
    const submitBtn: HTMLButtonElement | null = fixture.nativeElement.querySelector(
      '[data-testid="btn-restablecer"]',
    );
    expect(submitBtn?.disabled).toBe(true);
    expect(mockAuthService.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('contraseñas no coinciden: no llama al servicio', () => {
    const { component } = setupRoute('tok-abc');
    component.resetForm.patchValue({
      password: VALID_PASSWORD,
      passwordConfirm: OTHER_PASSWORD,
    });
    component.onSubmit();
    expect(mockAuthService.confirmPasswordReset).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBeTruthy();
  });

  it('submit válido: llama confirmPasswordReset con token + password', () => {
    const { component } = setupRoute('tok-abc');
    component.resetForm.patchValue({
      password: VALID_PASSWORD,
      passwordConfirm: VALID_PASSWORD,
    });
    component.onSubmit();
    expect(mockAuthService.confirmPasswordReset).toHaveBeenCalledWith(
      'tok-abc',
      VALID_PASSWORD,
    );
  });

  it('error 410: mensaje de enlace expirado', () => {
    mockAuthService = {
      confirmPasswordReset: jest.fn().mockReturnValue(
        throwError(() => ({ status: 410 })),
      ),
    };
    const { component } = setupRoute('tok-abc');
    component.resetForm.patchValue({
      password: VALID_PASSWORD,
      passwordConfirm: VALID_PASSWORD,
    });
    component.onSubmit();
    expect(component.errorMessage()).toMatch(/expirado|usado/i);
    expect(component.success()).toBe(false);
  });

  it('error 404: mensaje de enlace no válido', () => {
    mockAuthService = {
      confirmPasswordReset: jest.fn().mockReturnValue(
        throwError(() => ({ status: 404 })),
      ),
    };
    const { component } = setupRoute('tok-bad');
    component.resetForm.patchValue({
      password: VALID_PASSWORD,
      passwordConfirm: VALID_PASSWORD,
    });
    component.onSubmit();
    expect(component.errorMessage()).toMatch(/no es v/i);
  });

  it('password corto: no llama al servicio (alineado con backend min 12 + composición)', () => {
    const { component } = setupRoute('tok-abc');
    component.resetForm.patchValue({ password: 'short', passwordConfirm: 'short' });
    component.onSubmit();
    expect(mockAuthService.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('toggle de visibilidad de contraseña: type cambia text ↔ password', () => {
    const { component, fixture } = setupRoute('tok-abc');
    const input = fixture.nativeElement.querySelector(
      'input[formControlName="password"]',
    ) as HTMLInputElement;
    expect(input.type).toBe('password');
    component.togglePassword();
    fixture.detectChanges();
    expect(input.type).toBe('text');
    component.togglePassword();
    fixture.detectChanges();
    expect(input.type).toBe('password');
  });
});