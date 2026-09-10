import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { NewUserFormComponent } from './new-user-form.component';
import { UsersService } from '../services/users.service';
import { InvitationsService } from '../services/invitations.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { NewUserFormData, RolePermissionsView } from '../models/user.interface';

/**
 * F6 (`2026-09-08-f6-new-user-form`) — contrato del
 * `NewUserFormComponent`. Cubre los requirements del spec
 * (`admin-user-creation-form/spec.md`) Scenario por Scenario.
 *
 * Helpers locales:
 *  - `flushLookups()` simula la respuesta de `getFormData()`.
 *  - `setValid()` carga el formData mínimo válido (firstName, lastName,
 *    email).
 *  - `setRole(name, id)` selecciona un rol y devuelve la respuesta
 *    esperada de `getRolePermissions`.
 */
describe('NewUserFormComponent (F6 new-user-form)', () => {
  let component: NewUserFormComponent;
  let fixture: import('@angular/core/testing').ComponentFixture<NewUserFormComponent>;

  let mockUsersService: {
    getFormData: jest.Mock;
    createUserJson: jest.Mock;
    uploadAvatar: jest.Mock;
    getRolePermissions: jest.Mock;
    getPermissionsCatalog: jest.Mock;
  };
  let mockInvitationsService: { invite: jest.Mock };
  let mockToastService: {
    success: jest.Mock;
    error: jest.Mock;
    warning: jest.Mock;
  };
  let mockDialogService: { confirm: jest.Mock };
  let router: Router;

  /** Defaults de lookups: 2 roles (admin_org + operador_org) + 1 org. */
  const fixtureLookups = {
    roles: [
      { id: 'r-admin', name: 'admin_org' },
      { id: 'r-op', name: 'operador_org' },
      { id: 'r-other', name: 'ciudadano' },
    ],
    organizations: [{ id: 'o1', nombre: 'GAD Norte' }],
  };

  beforeEach(async () => {
    mockUsersService = {
      getFormData: jest.fn().mockReturnValue(of(fixtureLookups)),
      createUserJson: jest.fn().mockReturnValue(of({ id: 'u-new', email: 'juan@x.y' })),
      uploadAvatar: jest.fn().mockReturnValue(of({ id: 'u-new' })),
      getRolePermissions: jest.fn().mockReturnValue(of(['READ dashboard', 'READ incidents'])),
      getPermissionsCatalog: jest
        .fn()
        .mockReturnValue(of(['READ dashboard', 'READ incidents', 'UPDATE roles', 'READ audit'])),
    };
    mockInvitationsService = { invite: jest.fn().mockReturnValue(of({ id: 'inv-1' })) };
    mockToastService = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };
    mockDialogService = { confirm: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [NewUserFormComponent],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: UsersService, useValue: mockUsersService },
        { provide: InvitationsService, useValue: mockInvitationsService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(NewUserFormComponent);
    component = fixture.componentInstance;
  });

  // Helper: dispara ngOnInit y espera la respuesta de getFormData.
  const init = () => {
    fixture.detectChanges();
  };

  // -------------------------------------------------------------------
  // Inicialización / lookups
  // -------------------------------------------------------------------
  describe('N.3 — Inicialización y lookups', () => {
    it('S1.1: ngOnInit carga roles y orgs via getFormData', () => {
      init();
      expect(mockUsersService.getFormData).toHaveBeenCalledTimes(1);
      expect(component.roles().length).toBe(3);
      expect(component.organizations().length).toBe(1);
      expect(component.isLoadingLookups()).toBe(false);
    });

    it('S1.2: getFormData 500 enciende errorMessage y bloquea Guardar', () => {
      mockUsersService.getFormData.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
      init();
      expect(component.errorMessage()).toBeTruthy();
      expect(component.isFormValid()).toBe(false);
    });

    it('carga el catálogo de permisos para derivar "SIN ACCESO" (D-frontend-5.a)', () => {
      init();
      expect(mockUsersService.getPermissionsCatalog).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------
  // isFormValid (D-frontend-7)
  // -------------------------------------------------------------------
  describe('N.3.3 — isFormValid', () => {
    it('vacío → inválido', () => {
      init();
      expect(component.isFormValid()).toBe(false);
    });

    it('firstName de 1 letra → inválido', () => {
      init();
      component.formData.update((d) => ({ ...d, firstName: 'J' }));
      expect(component.isFormValid()).toBe(false);
    });

    it('firstName + lastName + email válidos sin rol → válido', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
      }));
      expect(component.isFormValid()).toBe(true);
    });

    it('email sin @ → inválido', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan',
      }));
      expect(component.isFormValid()).toBe(false);
    });

    it('rol admin_org sin organización → inválido', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        roleId: 'r-admin',
      }));
      expect(component.isFormValid()).toBe(false);
    });

    it('rol admin_org + organización → válido', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        roleId: 'r-admin',
        organizationId: 'o1',
      }));
      expect(component.isFormValid()).toBe(true);
    });

    it('rol ciudadano (no admin_org) sin org → válido', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        roleId: 'r-other',
      }));
      expect(component.isFormValid()).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // Role preview (N.4)
  // -------------------------------------------------------------------
  describe('N.4 — onRoleChange / selectedRolePermissions', () => {
    it('S4.1: seleccionar rol dispara getRolePermissions y llena access/noAccess', fakeAsync(() => {
      init();
      component.onRoleChange('r-admin');
      tick();
      expect(mockUsersService.getRolePermissions).toHaveBeenCalledWith('r-admin');
      const view: RolePermissionsView = component.selectedRolePermissions();
      expect(view.access).toEqual(['READ dashboard', 'READ incidents']);
      // permissionsCatalog tiene 4 perms; el rol tiene 2 → noAccess = 2.
      expect(view.noAccess).toEqual(['UPDATE roles', 'READ audit']);
    }));

    it('S4.2: rol null limpia el preview', () => {
      init();
      component.onRoleChange(null);
      expect(component.selectedRolePermissions()).toEqual({ access: [], noAccess: [] });
      expect(mockUsersService.getRolePermissions).not.toHaveBeenCalled();
    });

    it('S4.3: si el rol tiene todos los permisos del catálogo, noAccess queda vacío', fakeAsync(() => {
      mockUsersService.getRolePermissions.mockReturnValueOnce(
        of(['READ dashboard', 'READ incidents', 'UPDATE roles', 'READ audit']),
      );
      init();
      component.onRoleChange('r-admin');
      tick();
      expect(component.selectedRolePermissions().noAccess).toEqual([]);
    }));
  });

  // -------------------------------------------------------------------
  // Avatar upload (N.5)
  // -------------------------------------------------------------------
  describe('N.5 — onAvatarSelect', () => {
    const makeFile = (name: string, type: string, sizeBytes: number): File =>
      new File([new Uint8Array(sizeBytes)], name, { type });

    it('S5.1: JPG válido se previsualiza', () => {
      init();
      const file = makeFile('avatar.jpg', 'image/jpeg', 100 * 1024); // 100KB
      const event = { target: { files: [file], value: 'avatar.jpg' } } as unknown as Event;
      component.onAvatarSelect(event);
      // La validación es síncrona; el `FileReader.readAsDataURL` se
      // completa async (en jsdom dispara un microtask que `fakeAsync`
      // no intercepta, así que acá sólo validamos el camino
      // sincrónico: validación pasa, `pendingAvatar` se setea.
      expect(component.errorMessage()).toBeNull();
      expect(component.pendingAvatar()).toBe(file);
      // Cuando el FileReader dispare onload (en el navegador real, no
      // en el test), `avatarPreview` se setea con el data URL.
      expect(component.pendingAvatar()).not.toBeNull();
    });

    it('S5.2: PDF rechazado con mensaje', () => {
      init();
      const file = makeFile('doc.pdf', 'application/pdf', 1024);
      const event = { target: { files: [file], value: '' } } as unknown as Event;
      component.onAvatarSelect(event);
      expect(component.errorMessage()).toContain('JPG');
      expect(component.pendingAvatar()).toBeNull();
      expect(component.avatarPreview()).toBeNull();
    });

    it('S5.3: archivo > 2MB rechazado', () => {
      init();
      const file = makeFile('big.jpg', 'image/jpeg', 3 * 1024 * 1024); // 3MB
      const event = { target: { files: [file], value: '' } } as unknown as Event;
      component.onAvatarSelect(event);
      expect(component.errorMessage()).toContain('2MB');
      expect(component.pendingAvatar()).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // onSubmit (N.6)
  // -------------------------------------------------------------------
  describe('N.6 — onSubmit', () => {
    /** Helper: setea el form al mínimo válido (firstName, lastName, email). */
    const setValid = (overrides: Partial<NewUserFormData> = {}) => {
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        ...overrides,
      }));
    };

    it('S6.1: happy path — createUserJson + uploadAvatar + invite + navega', () => {
      init();
      setValid();
      component.pendingAvatar.set(
        new File([new Uint8Array(1024)], 'avatar.jpg', { type: 'image/jpeg' }),
      );
      component.onSubmit();
      expect(mockUsersService.createUserJson).toHaveBeenCalledWith({
        email: 'juan@municipio.gob.ec',
        first_name: 'Juan',
        last_name: 'Pérez',
        phone: '',
        role_id: null,
        organization_id: null,
      });
      expect(mockUsersService.uploadAvatar).toHaveBeenCalledWith('u-new', expect.any(File));
      expect(mockInvitationsService.invite).toHaveBeenCalledWith({
        email: 'juan@municipio.gob.ec',
        roleId: null,
        organizationId: null,
      });
      expect(mockToastService.success).toHaveBeenCalledWith(
        'Usuario creado correctamente',
        'Éxito',
      );
      expect(router.navigate).toHaveBeenCalledWith(['/app/admin/users']);
      expect(component.isSaving()).toBe(false);
    });

    it('S6.2: createUserJson 409 muestra toast email duplicado, no navega', () => {
      init();
      mockUsersService.createUserJson.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 409 })),
      );
      setValid();
      component.onSubmit();
      expect(mockToastService.error).toHaveBeenCalledWith(
        'Email ya registrado en el sistema',
        'Error',
      );
      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.isSaving()).toBe(false);
    });

    it('S6.3: createUserJson 403 muestra toast sin permiso', () => {
      init();
      mockUsersService.createUserJson.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 403 })),
      );
      setValid();
      component.onSubmit();
      expect(mockToastService.error).toHaveBeenCalledWith(
        'No tienes permiso para crear usuarios',
        'Acción no permitida',
      );
    });

    it('S6.4: createUserJson OK, uploadAvatar 500 → warning toast + navega', () => {
      init();
      mockUsersService.uploadAvatar.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      setValid();
      component.pendingAvatar.set(
        new File([new Uint8Array(1024)], 'avatar.jpg', { type: 'image/jpeg' }),
      );
      component.onSubmit();
      expect(mockToastService.warning).toHaveBeenCalledWith(
        expect.stringContaining('foto no se pudo subir'),
        'Aviso',
      );
      expect(router.navigate).toHaveBeenCalledWith(['/app/admin/users']);
    });

    it('S6.5: createUserJson OK, invite 409 → warning toast + navega', () => {
      init();
      mockInvitationsService.invite.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 409 })),
      );
      setValid();
      component.onSubmit();
      expect(mockToastService.warning).toHaveBeenCalledWith(
        expect.stringContaining('invitación no se envió'),
        'Aviso',
      );
      expect(router.navigate).toHaveBeenCalledWith(['/app/admin/users']);
    });

    it('S6.6: sendInvitation OFF → no llama a invite', () => {
      init();
      setValid({ sendInvitation: false });
      component.onSubmit();
      expect(mockInvitationsService.invite).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/app/admin/users']);
    });

    it('S6.7: sin avatar → no llama a uploadAvatar', () => {
      init();
      setValid();
      component.onSubmit();
      expect(mockUsersService.uploadAvatar).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/app/admin/users']);
    });

    it('S6.8: form inválido → no llama a createUserJson', () => {
      init();
      // form vacío
      component.onSubmit();
      expect(mockUsersService.createUserJson).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // onCancel (N.6.4)
  // -------------------------------------------------------------------
  describe('N.6.4 — onCancel', () => {
    it('form limpio navega directo sin confirmación', () => {
      init();
      component.onCancel();
      expect(mockDialogService.confirm).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/app/admin/users']);
    });

    it('form sucio + confirmar → navega', () => {
      init();
      component.formData.update((d) => ({ ...d, firstName: 'Juan' }));
      const subject = new Subject<boolean>();
      mockDialogService.confirm.mockReturnValue(subject.asObservable());
      component.onCancel();
      expect(mockDialogService.confirm).toHaveBeenCalled();
      subject.next(true);
      expect(router.navigate).toHaveBeenCalledWith(['/app/admin/users']);
    });

    it('form sucio + cancelar → no navega', () => {
      init();
      component.formData.update((d) => ({ ...d, firstName: 'Juan' }));
      const subject = new Subject<boolean>();
      mockDialogService.confirm.mockReturnValue(subject.asObservable());
      component.onCancel();
      subject.next(false);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('isFormDirty: defaults NO es dirty', () => {
      init();
      expect(component.isFormDirty()).toBe(false);
    });

    it('isFormDirty: cualquier campo editado SÍ es dirty', () => {
      init();
      component.formData.update((d) => ({ ...d, firstName: 'J' }));
      expect(component.isFormDirty()).toBe(true);
    });

    it('isFormDirty: pendingAvatar seteado SÍ es dirty', () => {
      init();
      component.pendingAvatar.set(
        new File([new Uint8Array(1024)], 'avatar.jpg', { type: 'image/jpeg' }),
      );
      expect(component.isFormDirty()).toBe(true);
    });
  });
});
