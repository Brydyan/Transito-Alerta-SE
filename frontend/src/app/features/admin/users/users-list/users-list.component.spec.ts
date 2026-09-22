import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '../../../../core/services/auth.service';
import { UsersService } from '../services/users.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { LayoutService } from '../../../../core/services/layout.service';

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
    localStorage.clear();
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

  // ── Filtros role/org locales (UX fix: el backend ignora role/org
  //    en GET /users, así que visibleUsers debe filtrar localmente) ──
  it('visibleUsers filtra localmente por rol cuando selectedRole está seteado (UX fix)', () => {
    component.selectedRole.set('1');
    const visible = component.visibleUsers();
    expect(visible.length).toBe(2);
    expect(visible.every((u) => String(u.rol?.rolId) === '1')).toBe(true);
  });

  it('visibleUsers filtra localmente por organización cuando selectedOrg está seteado (UX fix)', () => {
    component.users.set([
      {
        usuarioId: 'u1',
        nombres: 'A',
        apellidos: 'B',
        email: 'a@test.com',
        rol: { rolId: '1', nombre: 'ADMIN ORG' },
        organizationId: 'org-1',
      },
      {
        usuarioId: 'u2',
        nombres: 'C',
        apellidos: 'D',
        email: 'c@test.com',
        rol: { rolId: '2', nombre: 'OPERADOR ORG' },
        organizationId: null,
      },
    ] as never);
    component.selectedOrg.set('org-1');
    expect(component.visibleUsers().length).toBe(1);
    expect(component.visibleUsers()[0].usuarioId).toBe('u1');
  });

  it('filtros combinados: search + rol aplican AND (UX fix)', () => {
    component.onSearch('María');
    component.selectedRole.set('1');
    // "María" matchea la búsqueda pero su rol es 2 → 0 con rol 1.
    expect(component.visibleUsers().length).toBe(0);

    component.selectedRole.set('2');
    expect(component.visibleUsers().length).toBe(1);
    expect(component.visibleUsers()[0].email).toBe('maria@test.com');
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

/**
 * T-19 — RED: Failing tests for Users mobile cards (S9.2).
 *
 * S9.2: Users cards show nombre | email | rol + detail + ⋮.
 * S3.2: Load-more button on mobile when hasMore=true.
 * S4.1: Desktop still shows ui-table + inline filters.
 */
describe('UsersListComponent — mobile cards integration (S9.2)', () => {
  let component: UsersListComponent;
  let fixture: ComponentFixture<UsersListComponent>;
  let mockUsersService: {
    getUsers: jest.Mock;
    getRoles: jest.Mock;
    getOrganizations: jest.Mock;
    deleteUser: jest.Mock;
  };

  const fixtureUsers = [
    { usuarioId: '1', nombres: 'Juan', apellidos: 'Pérez', email: 'juan@test.com', rol: { rolId: '1', nombre: 'ADMIN ORG' } },
    { usuarioId: '2', nombres: 'María', apellidos: 'López', email: 'maria@test.com', rol: { rolId: '2', nombre: 'OPERADOR ORG' } },
  ];

  function setupMobile() {
    mockUsersService = {
      getUsers: jest.fn().mockReturnValue(
        of({ data: fixtureUsers, total: 2, meta: { total: 2, page: 1, last_page: 1, per_page: 10 } }),
      ),
      getRoles: jest.fn().mockReturnValue(of([])),
      getOrganizations: jest.fn().mockReturnValue(of([])),
      deleteUser: jest.fn().mockReturnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      imports: [UsersListComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { logout: jest.fn(), currentUser: signal({ name: 'Test', roleName: 'Admin' }) },
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: () => of(true) } },
        {
          provide: LayoutService,
          useValue: { isSmallViewport$: of(true) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('renders card grid on mobile (app-data-card elements)', () => {
    setupMobile();
    const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
    expect(cards.length).toBe(2);
  });

  it('each card shows nombre, email, and rol (S9.2)', () => {
    setupMobile();
    const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
    const firstCardText = cards[0].nativeElement.textContent;
    expect(firstCardText).toContain('Juan');
    expect(firstCardText).toContain('juan@test.com');
    expect(firstCardText).toContain('ADMIN ORG');
  });

  it('each card has "Ver detalle" button (S2.3)', () => {
    setupMobile();
    const detailBtns = fixture.debugElement.queryAll(By.css('[data-card-detail]'));
    expect(detailBtns.length).toBe(2);
  });

  it('each card has action dropdown (S2.4)', () => {
    setupMobile();
    const dropdowns = fixture.debugElement.queryAll(By.css('app-action-dropdown'));
    expect(dropdowns.length).toBe(2);
  });

  it('provides USERS_CARD_FIELDS to TableToCard', () => {
    setupMobile();
    expect(component['cardFields']).toBeDefined();
    expect(component['cardFields'].length).toBe(3);
  });

  it('card grid is visible and table is hidden on mobile', () => {
    setupMobile();
    const cardGrid = fixture.debugElement.query(By.css('[data-card-grid]'));
    expect(cardGrid).toBeTruthy();
    expect(cardGrid.nativeElement.classList.contains('hidden')).toBe(false);

    const tableWrapper = fixture.debugElement.query(By.css('[data-table-wrapper]'));
    expect(tableWrapper).toBeTruthy();
    expect(tableWrapper.nativeElement.classList.contains('hidden')).toBe(true);
  });

  it('mobile card "Editar" action navigates to /edit (S9.2 regression)', () => {
    setupMobile();
    const navigateSpy = jest.spyOn(component['router'] as never, 'navigate' as never) as unknown as jest.Mock;
    component.onCardAction({ action: { id: 'edit', label: 'Editar' }, data: { usuarioId: '1' } });
    expect(navigateSpy).toHaveBeenCalledWith(['/app/admin/users', '1', 'edit']);
  });

  it('mobile card "Eliminar" action confirms and deletes (S9.2 regression)', () => {
    setupMobile();
    component.onCardAction({ action: { id: 'delete', label: 'Eliminar' }, data: { usuarioId: '1' } });
    expect(mockUsersService.deleteUser).toHaveBeenCalledWith('1');
  });

  it('mobile card "Ver detalle" opens the read-only modal (S9.2 regression)', () => {
    setupMobile();
    const modalSpy = jest.spyOn(component['userDetailModalService'] as never, 'open' as never) as unknown as jest.Mock;
    component.onCardDetail({ usuarioId: '1' });
    expect(modalSpy).toHaveBeenCalled();
  });
});

/**
 * T-23 — RED: Failing tests for localStorage filter persistence (D9).
 *
 * D9: Use localStorage to persist filter/sort state per table.
 * S5.2: Filter state persists across navigation.
 * Key pattern: 'users-filters'.
 */
describe('UsersListComponent — localStorage filter persistence (D9)', () => {
  let component: UsersListComponent;
  let fixture: ComponentFixture<UsersListComponent>;
  let mockUsersService: {
    getUsers: jest.Mock;
    getRoles: jest.Mock;
    getOrganizations: jest.Mock;
    deleteUser: jest.Mock;
  };

  const STORAGE_KEY = 'users-filters';

  beforeEach(() => {
    localStorage.clear();
  });

  function setupWithFilters(storedFilters: Record<string, unknown> | null = null) {
    if (storedFilters) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));
    }

    mockUsersService = {
      getUsers: jest.fn().mockReturnValue(
        of({ data: [{ usuarioId: 1, nombres: 'Test', apellidos: 'User', email: 'test@test.com', rol: { rolId: 1, nombre: 'ADMIN' } }], total: 1, meta: { total: 1, page: 1, last_page: 1, per_page: 10 } }),
      ),
      getRoles: jest.fn().mockReturnValue(of([])),
      getOrganizations: jest.fn().mockReturnValue(of([])),
      deleteUser: jest.fn().mockReturnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      imports: [UsersListComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { logout: jest.fn(), currentUser: signal({ name: 'Test', roleName: 'Admin' }) },
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: () => of(true) } },
      ],
    });
  }

  it('saves filter state to localStorage on filter change (D9 key: users-filters)', () => {
    setupWithFilters();
    fixture = TestBed.createComponent(UsersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    component.onFilterChange({ role: '1', org: 'org-1' });

    expect(setItemSpy).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.any(String),
    );

    const stored = JSON.parse(setItemSpy.mock.calls[0][1] as string);
    expect(stored).toHaveProperty('role', '1');
    expect(stored).toHaveProperty('org', 'org-1');
    setItemSpy.mockRestore();
  });

  it('hydrates filter state from localStorage on ngOnInit (D9)', () => {
    setupWithFilters({ role: '2', org: '' });
    fixture = TestBed.createComponent(UsersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // The filter signals should be hydrated from localStorage
    expect(component.selectedRole()).toBe('2');
  });

  it('calls loadData with hydrated filters from localStorage (D9)', () => {
    setupWithFilters({ role: '1', org: '' });
    fixture = TestBed.createComponent(UsersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // getUsers should have been called with the hydrated role filter
    expect(mockUsersService.getUsers).toHaveBeenCalled();
    const callArgs = mockUsersService.getUsers.mock.calls[0];
    expect(callArgs[2]).toBe('1'); // role parameter
  });

  it('falls back to defaults when localStorage is empty (D9)', () => {
    setupWithFilters(null);
    fixture = TestBed.createComponent(UsersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.selectedRole()).toBe('');
    expect(component.selectedOrg()).toBe('');
  });

  it('saves search term to localStorage on search (D9)', () => {
    setupWithFilters();
    fixture = TestBed.createComponent(UsersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    component.onSearch('María');

    expect(setItemSpy).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.any(String),
    );

    const stored = JSON.parse(setItemSpy.mock.calls[0][1] as string);
    expect(stored).toHaveProperty('search', 'María');
    setItemSpy.mockRestore();
  });
});
