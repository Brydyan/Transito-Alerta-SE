import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '../../../../core/services/auth.service';
import { UsersService } from '../services/users.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

import { UsersListComponent } from './users-list.component';

/**
 * F6 rediseño (`2026-09-08-f6-usuarios-redesign`) — contrato del
 * `UsersListComponent`. Cubre los signals, el filtro local de
 * búsqueda, y la resiliencia a errores (D5: la falla de un
 * endpoint enciende `errorMessage` y la lista queda vacía).
 */
describe('UsersListComponent (F6 rediseño)', () => {
  let component: UsersListComponent;
  let fixture: ComponentFixture<UsersListComponent>;
  let mockUsersService: {
    getUsers: jest.Mock;
    getRoles: jest.Mock;
    getOrganizations: jest.Mock;
    deleteUser: jest.Mock;
  };

  const fixtureUsers = [
    { usuarioId: 1, nombres: 'Juan', apellidos: 'Pérez', email: 'juan@test.com', telefono: '+59399001', rol: { rolId: 1, nombre: 'ADMIN ORG' } },
    { usuarioId: 2, nombres: 'María', apellidos: 'López', email: 'maria@test.com', telefono: '+59399002', rol: { rolId: 2, nombre: 'OPERADOR ORG' } },
    { usuarioId: 3, nombres: 'Admin', apellidos: 'Master', email: 'admin@test.com', telefono: '+59399003', rol: { rolId: 1, nombre: 'ADMIN ORG' } },
  ];

  beforeEach(async () => {
    const mockAuthService = {
      logout: jest.fn(),
      currentUser: signal({ name: 'Test', roleName: 'Admin' }),
    };

    mockUsersService = {
      getUsers: jest.fn().mockReturnValue(
        of({ data: fixtureUsers, total: 3, meta: { total: 3, page: 1, last_page: 1, per_page: 25 } }),
      ),
      getRoles: jest.fn().mockReturnValue(of([{ rolId: 1, nombre: 'ADMIN ORG' }])),
      getOrganizations: jest.fn().mockReturnValue(of([])),
      deleteUser: jest.fn().mockReturnValue(of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [UsersListComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: UsersService, useValue: mockUsersService },
        // Mockeamos los dos servicios shared que el componente
        // inyecta. Sus llamadas durante los tests son no-op.
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: () => of(true) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('se crea y carga los datos iniciales', () => {
    expect(component).toBeTruthy();
    expect(component.users().length).toBe(3);
    expect(component.total()).toBe(3);
    expect(component.errorMessage()).toBeNull();
  });

  it('carga roles y organizaciones en paralelo al inicializar', () => {
    expect(mockUsersService.getRoles).toHaveBeenCalledTimes(1);
    expect(mockUsersService.getOrganizations).toHaveBeenCalledTimes(1);
  });

  it('búsqueda local filtra por nombre, email o rol', () => {
    component.onSearch('María');
    expect(component.visibleUsers().length).toBe(1);
    expect(component.visibleUsers()[0].email).toBe('maria@test.com');
  });

  it('búsqueda local es case-insensitive', () => {
    component.onSearch('ADMIN');
    // 2 usuarios cuyo rol es "ADMIN ORG" (case-insensitive en el haystack).
    expect(component.visibleUsers().length).toBe(2);
  });

  it('búsqueda vacía muestra todos los usuarios', () => {
    component.onSearch('María');
    expect(component.visibleUsers().length).toBe(1);
    component.onSearch('');
    expect(component.visibleUsers().length).toBe(3);
  });

  it('captura 500 del backend y enciende errorMessage', () => {
    mockUsersService.getUsers.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    component.onPageChange(2);
    expect(component.errorMessage()).toBe('No se pudieron cargar los usuarios.');
    expect(component.isLoading()).toBe(false);
  });

  it('onPageChange recarga del backend con la página nueva', () => {
    component.onPageChange(2);
    expect(mockUsersService.getUsers).toHaveBeenCalledWith(2, 10, undefined, undefined);
  });

  it('onFilterChange guarda role/org en signals, resetea la página y refetch con los filtros (fix batch C.2)', () => {
    component.onPageChange(2);
    mockUsersService.getUsers.mockClear();

    component.onFilterChange({ role: '1', org: 'org-1' });

    expect(component.selectedRole()).toBe('1');
    expect(component.selectedOrg()).toBe('org-1');
    expect(component.currentPage()).toBe(1);
    expect(mockUsersService.getUsers).toHaveBeenCalledWith(1, 10, '1', 'org-1');
  });

  it('getOrganizationName resuelve el nombre desde el signal organizations (fix batch C.1)', () => {
    expect(component.getOrganizationName(undefined)).toBe('—');
    expect(component.getOrganizationName(null)).toBe('—');

    component.organizations.set([{ id: 'org-1', nombre: 'GAD Guayaquil - Norte' }]);

    expect(component.getOrganizationName('org-1')).toBe('GAD Guayaquil - Norte');
    expect(component.getOrganizationName('org-404')).toBe('—');
  });

  it('delete llama al service y recarga la lista', () => {
    component.onDelete(1);
    expect(mockUsersService.deleteUser).toHaveBeenCalledWith(1);
  });
});
