import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { FormBuilder } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { UserFormComponent } from './user-form.component';
import { UsersService } from '../services/users.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { AuthService } from '../../../../core/services/auth.service';
import { InvitationsService } from '../services/invitations.service';
import type { PermissionItem } from '../models/user.interface';

/**
 * sc-340 (R5) — contract of `UserFormComponent` around the user
 * permissions panel: the search filter never throws on entries
 * without a legible name, and rows render legible labels with a
 * real `trackBy` identifier.
 *
 * Setup runs in create mode (no `:id` route param) as `master` so the
 * permissions panel is visible and `getPermissions()` is requested.
 */
describe('UserFormComponent (sc-340 user permissions panel)', () => {
  let component: UserFormComponent;
  let fixture: ComponentFixture<UserFormComponent>;

  let mockUsersService: {
    getRoles: jest.Mock;
    getPermissions: jest.Mock;
    getUserById: jest.Mock;
    getOrganizations: jest.Mock;
    getRoleById: jest.Mock;
  };
  let mockInvitationsService: { invite: jest.Mock };
  let mockToastService: { success: jest.Mock; error: jest.Mock; warning: jest.Mock };

  beforeEach(async () => {
    mockUsersService = {
      getRoles: jest.fn().mockReturnValue(of([])),
      getPermissions: jest.fn().mockReturnValue(of([])),
      getUserById: jest.fn(),
      getOrganizations: jest.fn().mockReturnValue(of([])),
      getRoleById: jest.fn().mockReturnValue(of({ rolId: '', nombre: '', permisos: [] })),
    };
    mockInvitationsService = { invite: jest.fn().mockReturnValue(of({ id: 'inv-1' })) };
    mockToastService = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [UserFormComponent],
      providers: [
        provideRouter([]),
        FormBuilder,
        { provide: UsersService, useValue: mockUsersService },
        { provide: InvitationsService, useValue: mockInvitationsService },
        { provide: ToastService, useValue: mockToastService },
        {
          provide: AuthService,
          useValue: { currentUser: jest.fn().mockReturnValue({ id: 'admin-1', roleName: 'master' }) },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: jest.fn().mockReturnValue(null) } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserFormComponent);
    component = fixture.componentInstance;
  });

  describe('sc-340 T13/R5 filteredAllPerms null-safety', () => {
    it('typing in the permission search does not throw when an entry lacks a legible name', () => {
      fixture.detectChanges();
      // Entry without `nombre`/`recurso`/`accion` (the pre-sc-340
      // service passed the raw wire through, so the panel could hold
      // exactly this shape).
      component.allPermissions.set([{ permisoId: 'perm-1' } as PermissionItem]);
      component.userPermSearch.set('read');
      expect(() => component.filteredAllPerms()).not.toThrow();
    });

    it('a search with no matches returns an empty list', () => {
      fixture.detectChanges();
      component.allPermissions.set([
        {
          permisoId: 'perm-1',
          nombre: 'READ dashboard',
          descripcion: '',
          recurso: 'dashboard',
          accion: 'READ',
        },
      ]);
      component.userPermSearch.set('zzz-no-match');
      expect(component.filteredAllPerms()).toEqual([]);
    });
  });

  describe('sc-340 T15/R5 user permissions render', () => {
    // Entries in the shape of the real wire: the identifier, resource
    // and action travel as `id`/`resource`/`action`, while the model
    // fields the template binds are empty (unmapped). Spread onto a
    // model-shaped base so the fixture stays type-clean without casts;
    // at runtime the panel receives wire-shaped data.
    const wireShaped = [
      { id: 'perm-uuid-1', resource: 'dashboard', action: 'READ' },
      { id: 'perm-uuid-2', resource: 'incidents', action: 'UPDATE' },
    ].map((w) => ({
      permisoId: '',
      nombre: '',
      descripcion: '',
      recurso: '',
      accion: '',
      ...w,
    }));

    it('every row shows a legible label and trackBy receives a real identifier', () => {
      mockUsersService.getPermissions.mockReturnValue(of(wireShaped));
      fixture.detectChanges();

      const labels = Array.from(
        fixture.nativeElement.querySelectorAll(
          'label[for^="user-perm-"]',
        ) as NodeListOf<HTMLElement>,
      ).map((el) => el.textContent ?? '');
      expect(labels.some((t) => t.includes('READ dashboard'))).toBe(true);
      expect(labels.some((t) => t.includes('UPDATE incidents'))).toBe(true);

      const ids = Array.from(
        fixture.nativeElement.querySelectorAll(
          'input[id^="user-perm-"]',
        ) as NodeListOf<HTMLElement>,
      ).map((el) => el.getAttribute('id') ?? '');
      expect(ids).toEqual(['user-perm-perm-uuid-1', 'user-perm-perm-uuid-2']);
    });
  });

  // 2026-10-16-resend-invitation (D4, D5) — botón "Reenviar invitación"
  // en la sección Cuenta del form de edición, visible sólo cuando
  // (a) el caller es Master, (b) el target es edit (no create),
  // (c) hay una invitación pendiente (no aceptada, no expirada).
  // El click llama `InvitationsService.invite()` con el email/roleId/
  // organizationId del target.
  describe('2026-10-16-resend-invitation', () => {
    /** Helper: setea `userData` + fuerza edit mode.
     *
     * El `userId` se evalúa una sola vez en la declaración de clase
     * (`readonly userId = route.snapshot.paramMap.get('id')`), con el
     * mock default de `:id = null` del `beforeEach`. Cambiar el mock
     * después NO afecta el `userId` ya capturado, así que forzamos
     * `component.userId` via cast. Esto testea los gates del template
     * sin depender del flow de carga real (ya cubierto por
     * `users.service.spec.ts`).
     */
    const setEditingUser = (overrides: Partial<{
      hasPendingInvitation: boolean;
      email: string;
      roleId: string;
      organizationId: string | null;
      roleName: string;
    }> = {}) => {
      // Forzar edit mode: `readonly userId` acepta el cast aquí
      // porque en runtime el field es reasignable (TS readonly es
      // compile-time only).
      (component as unknown as { userId: string }).userId = 'u-target';
      component.userData.set({
        usuarioId: 'u-target',
        email: overrides.email ?? 'shadow@x.com',
        nombres: 'Shadow',
        apellidos: 'User',
        telefono: '',
        isActive: false,
        preferredNotificationChannel: 'email',
        avatar: null,
        rol: { rolId: overrides.roleId ?? 'role-1', nombre: overrides.roleName ?? 'operator_org' },
        organizationId: overrides.organizationId ?? 'org-1',
        permisosDirectos: [],
        permisosRol: [],
        hasPendingInvitation: overrides.hasPendingInvitation ?? false,
      });
    };

    it('Master + shadow (isActive=false): muestra el botón "Reenviar invitación"', () => {
      // 2026-10-17-resend-invitation-email-fix — el botón ahora se
      // gatea por `canShowResend = isActive === false`, no por el
      // flag `hasPendingInvitation`. Razón: el flag lo computa el
      // backend con EXISTS contra `invitations.email`; cuando el
      // admin edita el email y guarda, `users.email` se actualiza
      // al nuevo pero `invitations.email` queda con el anterior,
      // entonces el EXISTS devuelve false → el botón desaparecía
      // después del edit. La nueva heurística es más útil: si el
      // user AÚN es shadow, puede recibir invitación.
      setEditingUser({ hasPendingInvitation: true });
      fixture.detectChanges();
      const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector(
        '[data-testid="btn-resend-invitation"]',
      );
      expect(btn).toBeTruthy();
      expect(btn?.textContent?.trim()).toBe('Reenviar invitación');
    });

    it('shadow (isActive=false) + hasPendingInvitation=false: SIGUE mostrando el botón (caso del edit-email bug)', () => {
      setEditingUser({ hasPendingInvitation: false });
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector(
        '[data-testid="btn-resend-invitation"]',
      );
      expect(btn).toBeTruthy();
    });

    it('NO shadow (isActive=true): oculta el botón', () => {
      // Re-set userData con isActive=true: el user ya completó
      // el alta, no es shadow — no tiene sentido ofrecer reenviar.
      setEditingUser({}); // carga userData con isActive=false
      (component.userData() as unknown as { isActive: boolean }).isActive = true;
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector(
        '[data-testid="btn-resend-invitation"]',
      );
      expect(btn).toBeNull();
    });

    it('no-Master: oculta el botón (la sección Cuenta ya está oculta, pero el flag doble protege)', () => {
      const auth = TestBed.inject(AuthService) as unknown as {
        currentUser: jest.Mock;
      };
      auth.currentUser.mockReturnValue({ id: 'admin-1', roleName: 'admin_org' });
      setEditingUser({ hasPendingInvitation: true });
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector(
        '[data-testid="btn-resend-invitation"]',
      );
      expect(btn).toBeNull();
    });

    it('click llama InvitationsService.invite() con email/roleId/organizationId', () => {
      setEditingUser({
        email: 'shadow@x.com',
        roleId: 'role-1',
        organizationId: 'org-1',
        hasPendingInvitation: true,
      });
      fixture.detectChanges();
      component.resendInvitation();
      expect(mockInvitationsService.invite).toHaveBeenCalledWith({
        email: 'shadow@x.com',
        roleId: 'role-1',
        organizationId: 'org-1',
      });
    });

    it('invite OK: muestra toast de éxito', () => {
      setEditingUser({ hasPendingInvitation: true });
      fixture.detectChanges();
      component.resendInvitation();
      expect(mockToastService.success).toHaveBeenCalledWith(
        'Invitación reenviada correctamente.',
      );
    });

    it('invite error: muestra toast de error y libera el spinner', () => {
      setEditingUser({ hasPendingInvitation: true });
      fixture.detectChanges();
      mockInvitationsService.invite.mockReturnValueOnce(
        throwError(() => new Error('boom')),
      );
      component.resendInvitation();
      expect(mockToastService.error).toHaveBeenCalledWith(
        'No se pudo reenviar la invitación.',
      );
      expect(component.isResending()).toBe(false);
    });
  });
});
