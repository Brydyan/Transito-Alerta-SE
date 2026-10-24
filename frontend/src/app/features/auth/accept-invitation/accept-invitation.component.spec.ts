import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { InvitationPreview } from '../../../core/models/auth.model';
import { AcceptInvitationComponent } from './accept-invitation.component';

/**
 * SC-207 — AcceptInvitationComponent tests.
 *
 * Mirrors auth.service.spec.ts fixture style: everything is faked at
 * the AuthService boundary (no HttpClientTestingModule needed here —
 * that contract is covered separately).
 */
describe('AcceptInvitationComponent', () => {
  let component: AcceptInvitationComponent;
  let fixture: ComponentFixture<AcceptInvitationComponent>;
  // 2026-10-19-post-login-redirect-by-role — `user` se consulta
  // post-aceptación para decidir el destino según el rol. Sin
  // este campo en el shape el build en CI (`tsc -b`) falla con
  // TS2353 / TS2339 aunque `jest` corra (ts-jest es más laxo).
  let authService: {
    previewInvitation: jest.Mock;
    acceptInvitation: jest.Mock;
    isAuthenticated: jest.Mock;
    clearSession: jest.Mock;
    user: jest.Mock;
  };
  let router: { navigate: jest.Mock };

  const preview: InvitationPreview = {
    organization_name: 'ACME Transit',
    inviter_name: 'Jane Admin',
    role_name: 'Operator',
    expires_at: '2026-09-05T00:00:00.000Z',
  };

  function setup(queryParams: Record<string, string> = { token: 'inv-token-123' }) {
    authService = {
      previewInvitation: jest.fn().mockReturnValue(of(preview)),
      acceptInvitation: jest.fn().mockReturnValue(of({ access_token: 'a', refresh_token: 'r', permissions: [] })),
      isAuthenticated: jest.fn().mockReturnValue(false),
      clearSession: jest.fn(),
      // 2026-10-19-post-login-redirect-by-role — el componente
      // consulta `authService.user()` después del auto-login para
      // elegir el destino. Default staff para compatibilidad con
      // tests existentes.
      user: jest.fn().mockReturnValue({
        id: 'u-test',
        roleName: 'operator_org',
        emailVerified: true,
        permissions: [],
      }),
    };
    router = { navigate: jest.fn() };

    TestBed.configureTestingModule({
      imports: [AcceptInvitationComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    });

    fixture = TestBed.createComponent(AcceptInvitationComponent);
    component = fixture.componentInstance;
  }

  // ───── Missing token ─────
  it('shows an error and never calls previewInvitation when the URL has no token', () => {
    setup({});
    fixture.detectChanges(); // triggers ngOnInit

    expect(authService.previewInvitation).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('No se proporcionó un token de invitación.');
    expect(component.invitation()).toBeNull();
  });

  // ───── Preview: happy path ─────
  it('fetches the preview on init and renders it', () => {
    setup();
    fixture.detectChanges();

    expect(authService.previewInvitation).toHaveBeenCalledWith('inv-token-123');
    expect(component.invitation()).toEqual(preview);
    expect(component.loading()).toBe(false);

    const html: string = fixture.nativeElement.textContent;
    expect(html).toContain('Jane Admin');
    expect(html).toContain('ACME Transit');
    expect(html).toContain('Operator');
  });

  // ───── Preview: clears an existing session first ─────
  it('clears an existing session before fetching the preview when already authenticated', () => {
    setup();
    authService.isAuthenticated.mockReturnValue(true);
    fixture.detectChanges();

    expect(authService.clearSession).toHaveBeenCalled();
    expect(authService.previewInvitation).toHaveBeenCalled();
  });

  // ───── Preview: 404 ─────
  it('shows "Invitación no encontrada." on a 404 preview response and does not render the form', () => {
    setup();
    authService.previewInvitation.mockReturnValue(throwError(() => ({ status: 404, message: 'not found' })));
    fixture.detectChanges();

    expect(component.errorMessage()).toBe('Invitación no encontrada.');
    expect(component.invitation()).toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  // ───── Preview: 410 ─────
  it('shows the expired/used copy on a 410 preview response', () => {
    setup();
    authService.previewInvitation.mockReturnValue(throwError(() => ({ status: 410, message: 'gone' })));
    fixture.detectChanges();

    expect(component.errorMessage()).toBe('La invitación expiró o ya fue utilizada.');
  });

  // ───── Password validation ─────
  it('does not submit when the password is shorter than 12 chars', () => {
    setup();
    fixture.detectChanges();

    component.form.controls['password'].setValue('short');
    component.onSubmit();

    expect(authService.acceptInvitation).not.toHaveBeenCalled();
    expect(component.form.invalid).toBe(true);
  });

  // ───── Submit: happy path ─────
  it('accepts the invitation and navigates to /app/dashboard on success (staff)', () => {
    setup();
    fixture.detectChanges();

    component.form.controls['password'].setValue('a-strong-password');
    component.onSubmit();

    expect(authService.acceptInvitation).toHaveBeenCalledWith({
      token: 'inv-token-123',
      password: 'a-strong-password',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/app/dashboard']);
    expect(component.loading()).toBe(false);
  });

  // 2026-10-19-post-login-redirect-by-role — el destino post-aceptación
  // depende del rol del usuario recién hidratado. `reporter` no tiene
  // `READ dashboard` y caería en loop con el guard nuevo.
  it('reporter recibe el rol de la invitación → navega a /app/inicio (no dashboard)', () => {
    setup();
    // Simula que `acceptInvitation` ya dejó la sesión hidratada
    // con rol `reporter` (el backend asigna según la invitación).
    (authService.user as jest.Mock).mockReturnValue({
      id: 'u-reporter',
      roleName: 'reporter',
      emailVerified: true,
      permissions: ['READ profile'],
    });
    fixture.detectChanges();

    component.form.controls['password'].setValue('a-strong-password');
    component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/app/inicio']);
    expect(router.navigate).not.toHaveBeenCalledWith(['/app/dashboard']);
  });

  // ───── Submit: 422 field errors ─────
  it('maps 422 field errors onto fieldErrors() and keeps the form visible', () => {
    setup();
    fixture.detectChanges();

    authService.acceptInvitation.mockReturnValue(
      throwError(() => ({ status: 422, message: 'validation', errors: { password: ['too weak'] } })),
    );
    component.form.controls['password'].setValue('a-strong-password');
    component.onSubmit();

    expect(component.fieldErrors()).toEqual({ password: ['too weak'] });
    expect(component.errorMessage()).toBe('Revisá los campos marcados.');
  });

  // ───── Submit: 410 (expired/used between preview and submit) ─────
  it('shows the expired/used copy when accept fails with 410', () => {
    setup();
    fixture.detectChanges();

    authService.acceptInvitation.mockReturnValue(throwError(() => ({ status: 410, message: 'gone' })));
    component.form.controls['password'].setValue('a-strong-password');
    component.onSubmit();

    expect(component.errorMessage()).toBe('La invitación expiró o ya fue utilizada.');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
