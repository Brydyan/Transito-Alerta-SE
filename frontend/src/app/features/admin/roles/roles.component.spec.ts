import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { RolesComponent } from './roles.component';
import { RolesService } from './services/roles.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { LayoutService } from '../../../core/services/layout.service';

/**
 * F6 rediseño (`2026-09-08-f6-roles-redesign`) — contrato del
 * `RolesComponent`. Cubre los signals, el filtro local de
 * búsqueda, la resiliencia a errores (D5: la falla de una
 * fuente no aborta la otra) y la integración con
 * `StatsCardsComponent`.
 */
describe('RolesComponent (F6 rediseño)', () => {
  let component: RolesComponent;
  let fixture: ComponentFixture<RolesComponent>;
  let mockRolesService: {
    getRoles: jest.Mock;
    getRoleStats: jest.Mock;
    deleteRole: jest.Mock;
  };
  let mockConfirmDialogService: { confirm: jest.Mock };

  const fixtureRoles = [
    { rolId: 1, nombre: 'admin_sistema', isSystemRole: true, permissionCount: 48 },
    { rolId: 2, nombre: 'operador_sistema', isSystemRole: true, permissionCount: 32 },
    { rolId: 3, nombre: 'admin_organizacion', isSystemRole: false, permissionCount: 24 },
    { rolId: 4, nombre: 'operador_organizacion', isSystemRole: false, permissionCount: 18 },
    { rolId: 5, nombre: 'usuario', isSystemRole: false, permissionCount: 8 },
  ];

  const fixtureStats = {
    totalPermissions: 124,
    protectedModules: 12,
    assignedUsers: 85,
  };

  beforeEach(async () => {
    localStorage.clear();
    mockRolesService = {
      getRoles: jest.fn().mockReturnValue(of(fixtureRoles)),
      getRoleStats: jest.fn().mockReturnValue(of(fixtureStats)),
      deleteRole: jest.fn().mockReturnValue(of(undefined)),
    };
    mockConfirmDialogService = {
      confirm: jest.fn().mockReturnValue(of(false)),
    };

    await TestBed.configureTestingModule({
      imports: [RolesComponent],
      providers: [
        provideRouter([]),
        { provide: RolesService, useValue: mockRolesService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: mockConfirmDialogService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RolesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('se crea y carga datos iniciales', () => {
    expect(component).toBeTruthy();
    expect(component.roles().length).toBe(5);
    expect(component.stats()).toEqual(fixtureStats);
    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toBeNull();
  });

  it('carga roles y stats en paralelo al inicializar', () => {
    expect(mockRolesService.getRoles).toHaveBeenCalledTimes(1);
    expect(mockRolesService.getRoleStats).toHaveBeenCalledTimes(1);
  });

  it('búsqueda local filtra por nombre (case-insensitive)', () => {
    component.onSearch('operador');
    expect(component.visibleRoles().length).toBe(2);
    expect(component.visibleRoles().map((r) => r.nombre)).toEqual([
      'operador_sistema',
      'operador_organizacion',
    ]);
  });

  it('búsqueda local reset-ea a página 1 vía refetch', () => {
    component.onPageChange(2);
    expect(mockRolesService.getRoles).toHaveBeenCalledTimes(2);
    component.onSearch('admin');
    // Refetch dispara una tercera llamada.
    expect(mockRolesService.getRoles).toHaveBeenCalledTimes(3);
  });

  it('búsqueda vacía muestra todos los roles', () => {
    component.onSearch('admin');
    expect(component.visibleRoles().length).toBeLessThan(5);
    component.onSearch('');
    expect(component.visibleRoles().length).toBe(5);
  });

  it('cardItems refleja la búsqueda local (UX fix: las cards mobile usan visibleRoles)', () => {
    component.onSearch('operador');
    // La tabla usa visibleRoles() pero cardItems usaba roles() crudo,
    // así la búsqueda no se reflejaba en las cards mobile.
    expect(component.cardItems().length).toBe(2);
    expect(component.cardItems().map((c) => c['nombre'])).toEqual([
      'operador_sistema',
      'operador_organizacion',
    ]);
  });

  it('captura 500 del backend en getRoles y enciende errorMessage', () => {
    mockRolesService.getRoles.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    component.onPageChange(2);
    expect(component.errorMessage()).toBe('No se pudieron cargar los roles.');
    expect(component.isLoading()).toBe(false);
  });

  it('fallo de stats no aborta roles (D5: cada fuente absorbe su error)', () => {
    mockRolesService.getRoleStats.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    // Forzar un nuevo ngOnInit con la falla en stats.
    component.ngOnInit();
    // Roles siguen cargados (5), stats cae a ceros.
    expect(component.roles().length).toBe(5);
    expect(component.stats()).toEqual({
      totalPermissions: 0,
      protectedModules: 0,
      assignedUsers: 0,
    });
  });

  it('delete llama al service y recarga cuando el confirm devuelve true', () => {
    mockConfirmDialogService.confirm.mockReturnValue(of(true));
    component.onDelete(5);
    expect(mockRolesService.deleteRole).toHaveBeenCalledWith(5);
  });

  it('delete NO llama al service cuando el confirm devuelve false', () => {
    mockConfirmDialogService.confirm.mockReturnValue(of(false));
    component.onDelete(5);
    expect(mockRolesService.deleteRole).not.toHaveBeenCalled();
  });

  // F6 fix batch (W.1) — los badges de permisos muestran el
  // `permissionCount` del backend. Mock 04-01 los espera como
  // 48 / 32 / 24 / 18 / 8 (en el orden de la lista). La aserción
  // cuenta los badges y verifica el orden — sin depender del
  // backend en el spec.
  it('S3: los badges de permisos muestran el permissionCount del backend en orden', () => {
    fixture.detectChanges();
    const badges = fixture.nativeElement.querySelectorAll('.permission-badge');
    expect(badges.length).toBe(5);
    const labels = Array.from(badges as NodeListOf<HTMLElement>).map((b) =>
      b.textContent?.trim() ?? '',
    );
    expect(labels).toEqual(['48', '32', '24', '18', '8']);
  });

  it('S3: un rol sin permissionCount muestra "—" (D5: cero es un valor, no un placeholder)', () => {
    mockRolesService.getRoles.mockReturnValue(of([
      { rolId: 99, nombre: 'sin_permisos' /* sin permissionCount */ },
    ]));
    (component as unknown as { loadRoles: () => void }).loadRoles();
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.permission-badge') as HTMLElement;
    expect(badge.textContent).toContain('—');
  });
});

/**
 * T-19 — RED: Failing tests for Roles mobile cards (S9.3).
 *
 * S9.3: Roles cards show nombre | [N] permisos | [N] usuarios + detail + ⋮.
 * S4.1: Desktop still shows ui-table + inline filters.
 */
describe('RolesComponent — mobile cards integration (S9.3)', () => {
  let component: RolesComponent;
  let fixture: ComponentFixture<RolesComponent>;
  let mockRolesService: {
    getRoles: jest.Mock;
    getRoleStats: jest.Mock;
    deleteRole: jest.Mock;
  };

  const fixtureRoles = [
    { rolId: '1', nombre: 'admin_sistema', isSystemRole: true, permissionCount: 48 },
    { rolId: '2', nombre: 'operador_sistema', isSystemRole: true, permissionCount: 32 },
  ];

  function setupMobile() {
    mockRolesService = {
      getRoles: jest.fn().mockReturnValue(of(fixtureRoles)),
      getRoleStats: jest.fn().mockReturnValue(of({ totalPermissions: 80, protectedModules: 5, assignedUsers: 10 })),
      deleteRole: jest.fn().mockReturnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      imports: [RolesComponent],
      providers: [
        provideRouter([]),
        { provide: RolesService, useValue: mockRolesService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: jest.fn().mockReturnValue(of(false)) } },
        {
          provide: LayoutService,
          useValue: { isSmallViewport$: of(true) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RolesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('renders card grid on mobile (app-data-card elements)', () => {
    setupMobile();
    const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
    expect(cards.length).toBe(2);
  });

  it('each card shows nombre and permissionCount (S9.3)', () => {
    setupMobile();
    const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
    const firstCardText = cards[0].nativeElement.textContent;
    expect(firstCardText).toContain('admin_sistema');
    expect(firstCardText).toContain('48');
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

  it('provides ROLES_CARD_FIELDS to TableToCard', () => {
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

  it('mobile card "Editar" action navigates to the role editor (S9.3 regression)', () => {
    setupMobile();
    const navigateSpy = jest.spyOn(component['router'] as never, 'navigate' as never) as unknown as jest.Mock;
    component.onCardAction({ action: { id: 'edit', label: 'Editar' }, data: { rolId: '1' } });
    expect(navigateSpy).toHaveBeenCalledWith(['/app/admin/roles', '1']);
  });

  it('mobile card "Eliminar" action confirms and deletes (S9.3 regression)', () => {
    setupMobile();
    (TestBed.inject(ConfirmDialogService).confirm as jest.Mock).mockReturnValue(of(true));
    component.onCardAction({ action: { id: 'delete', label: 'Eliminar' }, data: { rolId: '1' } });
    expect(mockRolesService.deleteRole).toHaveBeenCalledWith('1');
  });

  it('mobile card "Ver detalle" navigates to the role editor (S9.3 regression)', () => {
    setupMobile();
    const navigateSpy = jest.spyOn(component['router'] as never, 'navigate' as never) as unknown as jest.Mock;
    component.onCardDetail({ rolId: '1' });
    expect(navigateSpy).toHaveBeenCalledWith(['/app/admin/roles', '1']);
  });
});
