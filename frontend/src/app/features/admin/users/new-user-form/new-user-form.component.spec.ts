import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';

import { NewUserFormComponent } from './new-user-form.component';
import { UsersService } from '../services/users.service';
import { InvitationsService } from '../services/invitations.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { NewUserFormData, RolePermissionsView, Department } from '../models/user.interface';
import { GeoZoneService } from '../../../catalogs/locations/services/geo-zone.service';
import { AuthService } from '../../../../core/services/auth.service';

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
    getDepartments?: jest.Mock;
  };
  let mockInvitationsService: { invite: jest.Mock };
  let mockToastService: {
    success: jest.Mock;
    error: jest.Mock;
    warning: jest.Mock;
  };
  let mockDialogService: { confirm: jest.Mock };
  let mockGeoZoneService: { getFormData: jest.Mock };
  let mockAuthService: { currentUser: ReturnType<typeof signal<{ roleName: string | null; name: string | null } | null>> };
  let router: Router;

  /** Defaults de lookups: 2 roles sectoriales + 1 global + ciudadano + 1 org + 2 departamentos. */
  const fixtureLookups = {
    roles: [
      { id: 'r-admin', name: 'admin_org' },
      { id: 'r-op', name: 'operator_org' },
      { id: 'r-master', name: 'master' },
      { id: 'r-other', name: 'ciudadano' },
    ],
    organizations: [{ id: 'o1', nombre: 'GAD Norte' }],
    departments: [
      { id: 'd1', nombre: 'Tránsito', organizationId: 'o1' },
      { id: 'd2', nombre: 'Obras', organizationId: 'o1' },
      { id: 'd3', nombre: 'Otro GAD', organizationId: 'o2' },
    ] as Department[],
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
    mockGeoZoneService = {
      getFormData: jest.fn().mockReturnValue(of({
        levels: ['provincia', 'canton', 'parroquia', 'zona'],
        parents: [
          { id: 'gz-1', name: 'Pichincha', code: '17', level: 'provincia' },
          { id: 'gz-2', name: 'Quito', code: '17-01', level: 'canton' },
        ],
      })),
    };
    // Default: caller is admin_org (not master). El canal de
    // notificaciones está deshabilitado para no-Master y el payload
    // omite el campo. Tests del describe "Master-only" reescriben el
    // signal antes de `fixture.detectChanges()` para validar el otro
    // camino.
    mockAuthService = {
      currentUser: signal({ roleName: 'admin_org', name: 'Test Admin' }),
    };

    await TestBed.configureTestingModule({
      imports: [NewUserFormComponent],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: UsersService, useValue: mockUsersService },
        { provide: InvitationsService, useValue: mockInvitationsService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: GeoZoneService, useValue: mockGeoZoneService },
        { provide: AuthService, useValue: mockAuthService },
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
    it('S1.1: ngOnInit carga roles, orgs y departments via getFormData', () => {
      init();
      expect(mockUsersService.getFormData).toHaveBeenCalledTimes(1);
      expect(component.roles().length).toBe(4);
      expect(component.organizations().length).toBe(1);
      expect(component.departments().length).toBe(3);
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

    it('rol admin_org + organización + departamento → válido', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        roleId: 'r-admin',
        organizationId: 'o1',
        departmentId: 'd1',
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
  // sc-340 T17/R2 — role with UUID permissions renders labels.
  // Post-0051 the role carries permission UUIDs (opaque to this
  // component); `UsersService.getRolePermissions` (T10/T11) resolves
  // them against the catalog, so the preview below only ever sees
  // labels — or the explicit unknown-permission marker.
  // -------------------------------------------------------------------
  describe('sc-340 T17/R2 — UUID role permissions render as labels', () => {
    it('access pills show resolved labels, never raw UUIDs', fakeAsync(() => {
      init();
      mockUsersService.getRolePermissions.mockReturnValueOnce(
        of(['READ dashboard', 'READ incidents']),
      );
      component.onRoleChange('r-admin');
      tick();
      const view: RolePermissionsView = component.selectedRolePermissions();
      expect(view.access).toEqual(['READ dashboard', 'READ incidents']);
      expect(view.access.some((l) => /^[0-9a-f-]{36}$/i.test(l))).toBe(false);
      fixture.detectChanges();
      const pills = Array.from(
        fixture.nativeElement.querySelectorAll(
          '[data-testid="role-access"] .permission-pill',
        ) as NodeListOf<HTMLElement>,
      ).map((el) => el.textContent?.trim() ?? '');
      expect(pills).toEqual(['READ dashboard', 'READ incidents']);
    }));

    it('an orphan UUID degrades to the explicit marker in the preview', fakeAsync(() => {
      init();
      mockUsersService.getRolePermissions.mockReturnValueOnce(
        of(['permiso no encontrado']),
      );
      component.onRoleChange('r-admin');
      tick();
      expect(component.selectedRolePermissions().access).toEqual([
        'permiso no encontrado',
      ]);
      fixture.detectChanges();
      const body =
        fixture.nativeElement.querySelector('[data-testid="role-access"]')
          ?.textContent ?? '';
      expect(body).toContain('permiso no encontrado');
      expect(body).not.toContain('undefined');
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
        department_id: null,
        geo_zone_id: null,
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

    it('S6.2: createUserJson 409 con code PHONE muestra toast teléfono duplicado, no navega', () => {
      // 2026-10-17 — el backend ahora emite `code: PHONE_ALREADY_REGISTERED`
      // en el body del 409 cuando el teléfono choca. Antes el frontend
      // mostraba "Email ya registrado" para cualquier 409, lo que
      // confundía al admin.
      init();
      mockUsersService.createUserJson.mockReturnValueOnce(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { code: 'PHONE_ALREADY_REGISTERED', message: '...' },
            }),
        ),
      );
      setValid();
      component.onSubmit();
      expect(mockToastService.error).toHaveBeenCalledWith(
        'El teléfono ya está registrado por otro usuario',
        'Error',
      );
      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.isSaving()).toBe(false);
    });

    it('S6.2b: createUserJson 409 con code EMAIL muestra toast email duplicado, no navega', () => {
      // Defensa: si el backend emite EMAIL_ALREADY_CLAIMED en el
      // body, el toast es específico de email. (Hoy el adminCreate
      // no chequea email duplicado, pero la diferenciación deja la
      // puerta abierta para cuando lo agreguen sin tocar el frontend.)
      init();
      mockUsersService.createUserJson.mockReturnValueOnce(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { code: 'EMAIL_ALREADY_CLAIMED', message: '...' },
            }),
        ),
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

    it('S6.2c: createUserJson 409 sin code reconocible cae al fallback email (compatibilidad)', () => {
      // Backward compat: si el backend NO incluye `code` en el body
      // (versión vieja o respuesta sin shape esperado), el toast
      // sigue siendo "Email ya registrado en el sistema" — el admin
      // recibe feedback útil en vez de un "Error 409" genérico.
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

  // -------------------------------------------------------------------
  // D1 — Departments: filteredDepartments y validación
  // -------------------------------------------------------------------
  describe('D1 — Departamentos: señal y filtrado reactivo', () => {
    it('carga departments desde getFormData', () => {
      init();
      expect(component.departments().length).toBe(3);
    });

    it('filteredDepartments vacío cuando no hay org seleccionada', () => {
      init();
      component.formData.update((d) => ({ ...d, organizationId: null }));
      expect(component.filteredDepartments().length).toBe(0);
    });

    it('filteredDepartments filtra por organizationId seleccionada', () => {
      init();
      component.formData.update((d) => ({ ...d, organizationId: 'o1' }));
      const filtered = component.filteredDepartments();
      expect(filtered.length).toBe(2);
      expect(filtered.every((d) => d.organizationId === 'o1')).toBe(true);
    });

    it('onOrganizationChange resetea departmentId a null', () => {
      init();
      component.formData.update((d) => ({ ...d, departmentId: 'd1' }));
      component.onOrganizationChange('o1');
      expect(component.formData().departmentId).toBeNull();
    });

    it('onDepartmentChange actualiza departmentId', () => {
      init();
      component.onDepartmentChange('d1');
      expect(component.formData().departmentId).toBe('d1');
    });
  });

  // -------------------------------------------------------------------
  // D2 — Roles globales: isGlobalRole y forzar null
  // -------------------------------------------------------------------
  describe('D2 — Roles globales: isGlobalRole computed', () => {
    it('isGlobalRole false cuando no hay rol', () => {
      init();
      component.formData.update((d) => ({ ...d, roleId: null }));
      expect(component.isGlobalRole()).toBe(false);
    });

    it('isGlobalRole true para rol master', () => {
      init();
      component.formData.update((d) => ({ ...d, roleId: 'r-master' }));
      expect(component.isGlobalRole()).toBe(true);
    });

    it('isGlobalRole false para rol admin_org', () => {
      init();
      component.formData.update((d) => ({ ...d, roleId: 'r-admin' }));
      expect(component.isGlobalRole()).toBe(false);
    });

    it('isGlobalRole true para rol agent_system', () => {
      init();
      // Necesita un fixture de role con name 'agent_system'
      // Actualizar fixtureLookups.roles para incluirlo, o agregarlo solo en este test:
      component.roles.update((rs) => [...rs, { id: 'r-op-sis', name: 'agent_system' }]);
      component.formData.update((d) => ({ ...d, roleId: 'r-op-sis' }));
      expect(component.isGlobalRole()).toBe(true);
    });

    it('isFormValid: rol agent_system sin org ni departamento → válido (global)', () => {
      init();
      component.roles.update((rs) => [...rs, { id: 'r-op-sis', name: 'agent_system' }]);
      component.formData.update((d) => ({
        ...d,
        firstName: 'Ana',
        lastName: 'López',
        email: 'ana@municipio.gob.ec',
        roleId: 'r-op-sis',
      }));
      expect(component.isFormValid()).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // D1 — isFormValid con departmentId para roles sectoriales
  // -------------------------------------------------------------------
  describe('D1 — isFormValid: departmentId requerido para roles sectoriales', () => {
    it('rol admin_org + org + sin departamento → inválido', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        roleId: 'r-admin',
        organizationId: 'o1',
        departmentId: null,
      }));
      expect(component.isFormValid()).toBe(false);
    });

    it('rol admin_org + org + departamento → válido', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        roleId: 'r-admin',
        organizationId: 'o1',
        departmentId: 'd1',
      }));
      expect(component.isFormValid()).toBe(true);
    });

    it('rol master sin org ni departamento → válido (global)', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        roleId: 'r-master',
      }));
      expect(component.isFormValid()).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // D1 — onSubmit incluye department_id en el payload
  // -------------------------------------------------------------------
  describe('D1 — onSubmit: department_id en payload', () => {
    it('department_id se incluye cuando hay departamento seleccionado', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        roleId: 'r-admin',
        organizationId: 'o1',
        departmentId: 'd1',
      }));
      component.onSubmit();
      expect(mockUsersService.createUserJson).toHaveBeenCalledWith(
        expect.objectContaining({ department_id: 'd1', organization_id: 'o1' }),
      );
    });
  });

  // -------------------------------------------------------------------
  // sc-446 — Alcance Territorial: geoZones signal + onGeoZoneChange + payload
  // -------------------------------------------------------------------
  describe('sc-446 — Alcance Territorial (geoZones signal, handler, submit payload)', () => {
    it('G1: GeoZoneService.getFormData() es llamado en ngOnInit y geoZones se puebla', () => {
      init();
      expect(mockGeoZoneService.getFormData).toHaveBeenCalledTimes(1);
      expect(component.geoZones().length).toBe(2);
      expect(component.geoZones()[0].id).toBe('gz-1');
    });

    it('G2: geoZones signal contiene los parents de getFormData()', () => {
      init();
      expect(component.geoZones()[1].name).toBe('Quito');
    });

    it('G3: onGeoZoneChange actualiza formData().geoZoneId', () => {
      init();
      component.onGeoZoneChange('gz-1');
      expect(component.formData().geoZoneId).toBe('gz-1');
    });

    it('G3b: onGeoZoneChange con null limpia geoZoneId', () => {
      init();
      component.onGeoZoneChange('gz-1');
      component.onGeoZoneChange(null);
      expect(component.formData().geoZoneId).toBeNull();
    });

    it('G4: onSubmit incluye geo_zone_id en el payload cuando hay zona seleccionada', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        geoZoneId: 'gz-2',
      }));
      component.onSubmit();
      expect(mockUsersService.createUserJson).toHaveBeenCalledWith(
        expect.objectContaining({ geo_zone_id: 'gz-2' }),
      );
    });

    it('G5: onSubmit incluye geo_zone_id: null cuando no hay zona seleccionada', () => {
      init();
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        geoZoneId: null,
      }));
      component.onSubmit();
      expect(mockUsersService.createUserJson).toHaveBeenCalledWith(
        expect.objectContaining({ geo_zone_id: null }),
      );
    });
  });

  // -------------------------------------------------------------------
  // 2026-10-16-new-user-form-notif-channel — el campo "Canal de
  // notificaciones preferido" deja de ser F7-placeholder: Master lo
  // configura en alta; admin_org lo ve deshabilitado con hint. El
  // payload del submit incluye `preferred_notification_channel`
  // SOLO cuando el caller es Master (defensa en profundidad — el
  // DTO del backend acepta el campo, pero el form lo filtra para
  // mantener el surface area coherente con la regla "isActive es
  // Master-only").
  // -------------------------------------------------------------------
  describe('N.7 — canal de notificaciones (Master-only)', () => {
    /** Helper: setea el form al mínimo válido. */
    const setValid = (overrides: Partial<NewUserFormData> = {}) => {
      component.formData.update((d) => ({
        ...d,
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@municipio.gob.ec',
        ...overrides,
      }));
    };

    it('Master: el selector de canal está habilitado', () => {
      mockAuthService.currentUser.set({ roleName: 'master', name: 'Root' });
      init();
      expect(component.isMaster()).toBe(true);
      fixture.detectChanges();
      const select: HTMLSelectElement = fixture.nativeElement.querySelector(
        '[data-testid="select-channel"]',
      );
      expect(select).toBeTruthy();
      expect(select.disabled).toBe(false);
    });

    it('Master: cambiar canal a "telegram" actualiza formData().notificationChannel', () => {
      mockAuthService.currentUser.set({ roleName: 'master', name: 'Root' });
      init();
      component.onNotificationChannelChange('telegram');
      expect(component.formData().notificationChannel).toBe('telegram');
    });

    it('no-Master: el selector de canal está deshabilitado y formData arranca en "email"', () => {
      // Default del beforeEach = admin_org. isMaster() = false.
      init();
      expect(component.isMaster()).toBe(false);
      expect(component.formData().notificationChannel).toBe('email');
      fixture.detectChanges();
      const select: HTMLSelectElement = fixture.nativeElement.querySelector(
        '[data-testid="select-channel"]',
      );
      expect(select).toBeTruthy();
      expect(select.disabled).toBe(true);
    });

    it('Master: onSubmit envía preferred_notification_channel en el payload', () => {
      mockAuthService.currentUser.set({ roleName: 'master', name: 'Root' });
      init();
      setValid({ notificationChannel: 'telegram' });
      component.onSubmit();
      expect(mockUsersService.createUserJson).toHaveBeenCalledWith(
        expect.objectContaining({ preferred_notification_channel: 'telegram' }),
      );
    });

    it('no-Master: onSubmit NO envía preferred_notification_channel en el payload', () => {
      // admin_org — el form no manda el campo aunque el signal
      // estuviera en 'telegram' (defense in depth del form: aunque un
      // admin_org lograra mutar el signal, el submit no propaga).
      init();
      setValid({ notificationChannel: 'telegram' });
      component.onSubmit();
      const callArg = mockUsersService.createUserJson.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('preferred_notification_channel');
    });
  });
});
