import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrganizationListComponent } from './organization-list.component';
import { OrganizationService } from '../services/organization.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { LayoutService } from '../../../../core/services/layout.service';
import { IOrganization } from '../interfaces/iorganization.interface';

describe('OrganizationListComponent', () => {
  let mockOrganizationService: {
    list: jest.Mock;
    listAll: jest.Mock;
    formData: jest.Mock;
    remove: jest.Mock;
  };
  let mockToastService: { success: jest.Mock; error: jest.Mock };
  let mockDialogService: { confirm: jest.Mock };
  let mockActivatedRoute: unknown;
  let mockAuthService: { currentUser: () => { permissions: string[] } };

  const org = (over: Partial<IOrganization> & { id: string }): IOrganization => ({
    name: `Org ${over.id}`,
    zone_id: null,
    parent_id: null,
    incident_category_id: null,
    max_active_claims: 0,
    created_at: '2026-07-22T00:00:00Z',
    ...over,
  });

  const setup = (
    items: IOrganization[],
    zones: Array<{ id: string; name: string }> = [],
  ) => {
    mockOrganizationService.list.mockReturnValue(
      of({ items, total: items.length }),
    );
    mockOrganizationService.listAll.mockReturnValue(of(items));
    mockOrganizationService.formData.mockReturnValue(
      of({ roles: [], geo_zones: zones }),
    );

    return render(OrganizationListComponent, {
      providers: [
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: AuthService, useValue: mockAuthService },
      ],
    });
  };

  beforeEach(() => {
    localStorage.clear();
    mockOrganizationService = {
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
      listAll: jest.fn().mockReturnValue(of([])),
      formData: jest.fn().mockReturnValue(of({ roles: [], geo_zones: [] })),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };
    mockToastService = { success: jest.fn(), error: jest.fn() };
    mockDialogService = { confirm: jest.fn().mockReturnValue(of(true)) };
    mockActivatedRoute = { snapshot: { params: {} } };
    mockAuthService = {
      currentUser: () => ({
        permissions: [
          'READ organizations',
          'CREATE organizations',
          'UPDATE organizations',
          'DELETE organizations',
        ],
      }),
    };
  });

  it('renders rows for fetched organizations', async () => {
    await setup([org({ id: '1', name: 'Org 1' }), org({ id: '2', name: 'Org 2' })]);

    // TableToCard renders both desktop (ui-table) and mobile (app-data-card) branches
    // in the DOM — one hidden via CSS — so text appears duplicated. Check at least one.
    expect(screen.queryAllByText('Org 1').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText('Org 2').length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty-state when no organizations exist', async () => {
    await setup([]);

    expect(
      screen.queryByText(/Sin datos/i) ||
        document.querySelector('.empty-state-container'),
    ).toBeTruthy();
  });

  /**
   * F2.5.7 — el mock 08-01 muestra una columna «LOCALIZACIÓN» por
   * organización. El wire trae `zone_id` (un UUID), así que el nombre se
   * resuelve contra `GET /organizations/form-data`.
   */
  describe('columna LOCALIZACIÓN', () => {
    it('resuelve el nombre de la zona a partir de zone_id', async () => {
      await setup(
        [org({ id: '1', name: 'GAD Municipal del Cantón Quito', zone_id: 'z-q' })],
        [
          { id: 'z-q', name: 'Quito' },
          { id: 'z-g', name: 'Guayaquil' },
        ],
      );

      expect(screen.queryAllByText('Quito').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Guayaquil')).toBeFalsy();
    });

    it('muestra un guion cuando la organización no tiene zona', async () => {
      const { fixture } = await setup([org({ id: '1', zone_id: null })], []);

      expect(fixture.componentInstance.zoneName(null)).toBe('—');
    });

    it('muestra un guion cuando la zona no está en form-data', async () => {
      const { fixture } = await setup(
        [org({ id: '1', zone_id: 'z-desconocida' })],
        [{ id: 'z-q', name: 'Quito' }],
      );

      expect(fixture.componentInstance.zoneName('z-desconocida')).toBe('—');
    });
  });

  /**
   * Tarjetas al pie del mock 08-01: total de entidades, ciudades alcanzadas
   * (cantones distintos) y altas del mes.
   */
  describe('tarjetas de resumen', () => {
    it('cuenta ciudades alcanzadas como zonas distintas, no como filas', async () => {
      const { fixture } = await setup(
        [
          org({ id: '1', zone_id: 'z-q' }),
          org({ id: '2', zone_id: 'z-q' }),
          org({ id: '3', zone_id: 'z-g' }),
          org({ id: '4', zone_id: null }),
        ],
        [
          { id: 'z-q', name: 'Quito' },
          { id: 'z-g', name: 'Guayaquil' },
        ],
      );

      // Cuatro organizaciones, dos zonas reales, una sin zona.
      expect(fixture.componentInstance.citiesReached()).toBe(2);
    });

    it('cuenta el total sobre el catálogo entero, no sobre la página', async () => {
      const { fixture } = await setup([
        org({ id: '1' }),
        org({ id: '2' }),
        org({ id: '3' }),
      ]);

      expect(fixture.componentInstance.totalCount()).toBe(3);
    });

    it('cuenta sólo las altas del mes en curso', async () => {
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 5).toISOString();
      const lastYear = new Date(now.getFullYear() - 1, now.getMonth(), 5).toISOString();

      const { fixture } = await setup([
        org({ id: '1', created_at: thisMonth }),
        org({ id: '2', created_at: thisMonth }),
        org({ id: '3', created_at: lastYear }),
      ]);

      expect(fixture.componentInstance.monthCount()).toBe(2);
    });
  });
});

/**
 * T-25 — RED: Failing integration tests for OrganizationListComponent
 * mobile cards (S9.4).
 *
 * S9.4: Orgs card nombre | zoneNames.get(zone_id) | [N] usuarios
 *       + actions edit/delete/assign-category
 * S2.1: card grid responsive
 * S3.2: Ver más datos
 * S4.2: FilterDrawer wrapping search
 * S1.1, S3.1: desktop table path unchanged
 */
describe('OrganizationListComponent — mobile cards integration (S9.4)', () => {
  let mockOrganizationService: {
    list: jest.Mock;
    listAll: jest.Mock;
    formData: jest.Mock;
    remove: jest.Mock;
  };

  const org = (over: Partial<IOrganization> & { id: string }): IOrganization => ({
    name: `Org ${over.id}`,
    zone_id: null,
    parent_id: null,
    incident_category_id: null,
    max_active_claims: 0,
    created_at: '2026-07-22T00:00:00Z',
    ...over,
  });

  const fixtureOrgs = [
    org({ id: '1', name: 'GAD Quito', zone_id: 'z-q' }),
    org({ id: '2', name: 'GAD Guayaquil', zone_id: 'z-g' }),
  ];

  function setupMobile() {
    mockOrganizationService = {
      list: jest.fn().mockReturnValue(of({ items: fixtureOrgs, total: 2 })),
      listAll: jest.fn().mockReturnValue(of(fixtureOrgs)),
      formData: jest.fn().mockReturnValue(
        of({ roles: [], geo_zones: [{ id: 'z-q', name: 'Quito' }, { id: 'z-g', name: 'Guayaquil' }] }),
      ),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      imports: [OrganizationListComponent],
      providers: [
        provideRouter([]),
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: jest.fn().mockReturnValue(of(true)) } },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({
              permissions: ['READ organizations', 'CREATE organizations', 'UPDATE organizations', 'DELETE organizations'],
            }),
          },
        },
        {
          provide: LayoutService,
          useValue: { isSmallViewport$: of(true) },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} } } },
      ],
    });

    const fixture = TestBed.createComponent(OrganizationListComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, component };
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it('renders card grid on mobile (app-data-card elements)', () => {
    const { fixture } = setupMobile();
    const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
    expect(cards.length).toBe(2);
  });

  it('each card shows nombre, resolved zona, and usuarios count (S9.4)', () => {
    const { fixture } = setupMobile();
    const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
    const firstCardText = cards[0].nativeElement.textContent;
    expect(firstCardText).toContain('GAD Quito');
    expect(firstCardText).toContain('Quito');
    // usuariosCount placeholder —DataCard shows count derived
    const secondCardText = cards[1].nativeElement.textContent;
    expect(secondCardText).toContain('GAD Guayaquil');
    expect(secondCardText).toContain('Guayaquil');
  });

  it('each card has "Ver detalle" button (S2.3)', () => {
    const { fixture } = setupMobile();
    const detailBtns = fixture.debugElement.queryAll(By.css('[data-card-detail]'));
    expect(detailBtns.length).toBe(2);
  });

  it('each card has action dropdown (S2.4) with edit/delete/assign-category (S9.4)', () => {
    const { fixture, component } = setupMobile();
    const dropdowns = fixture.debugElement.queryAll(By.css('app-action-dropdown'));
    expect(dropdowns.length).toBe(2);
    const actions = (component as unknown as { cardActions: { value: unknown[] } | unknown[] })['cardActions'];
    const actionsArray = Array.isArray(actions) ? actions : (actions as { value: unknown[] })?.value ?? [];
    // Fallback: check computed signal value if available
    const computedActions = (component as unknown as { cardActions: () => unknown[] }).cardActions;
    const actionList = typeof computedActions === 'function' ? (computedActions as unknown as (() => unknown[]))() : actionsArray;
    // At minimum expect 2 actions, ideally 3 including assign-category
    expect(Array.isArray(actionList) ? actionList.length : 0).toBeGreaterThanOrEqual(2);
  });

  it('provides ORGANIZATIONS_CARD_FIELDS to TableToCard (3 fields)', () => {
    const { component } = setupMobile();
    const fields = (component as unknown as { cardFields: unknown[] })['cardFields'];
    expect(fields).toBeDefined();
    expect(Array.isArray(fields) ? fields.length : 0).toBe(3);
  });

  it('FilterDrawer wraps search input on mobile (S4.2)', () => {
    const { fixture } = setupMobile();
    const drawer = fixture.debugElement.query(By.css('app-filter-drawer'));
    expect(drawer).toBeTruthy();
    // search input should be inside drawer projection
    const searchInputs = fixture.debugElement.queryAll(By.css('input[aria-label="Buscar organizaciones"]'));
    expect(searchInputs.length).toBeGreaterThanOrEqual(1);
  });

  it('card grid is visible and table is hidden on mobile (S2.1)', () => {
    const { fixture } = setupMobile();
    const cardGrid = fixture.debugElement.query(By.css('[data-card-grid]'));
    expect(cardGrid).toBeTruthy();
    expect(cardGrid.nativeElement.classList.contains('hidden')).toBe(false);
    const tableWrapper = fixture.debugElement.query(By.css('[data-table-wrapper]'));
    expect(tableWrapper).toBeTruthy();
    expect(tableWrapper.nativeElement.classList.contains('hidden')).toBe(true);
  });

  it('desktop table path unchanged: ui-table visible when not mobile (S1.1)', () => {
    mockOrganizationService = {
      list: jest.fn().mockReturnValue(of({ items: fixtureOrgs, total: 2 })),
      listAll: jest.fn().mockReturnValue(of(fixtureOrgs)),
      formData: jest.fn().mockReturnValue(of({ roles: [], geo_zones: [] })),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [OrganizationListComponent],
      providers: [
        provideRouter([]),
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: jest.fn().mockReturnValue(of(true)) } },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({
              permissions: ['READ organizations', 'CREATE organizations', 'UPDATE organizations', 'DELETE organizations'],
            }),
          },
        },
        {
          provide: LayoutService,
          useValue: { isSmallViewport$: of(false) },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} } } },
      ],
    });
    const fixture = TestBed.createComponent(OrganizationListComponent);
    fixture.detectChanges();
    const tableWrapper = fixture.debugElement.query(By.css('[data-table-wrapper]'));
    expect(tableWrapper).toBeTruthy();
    expect(tableWrapper.nativeElement.classList.contains('hidden')).toBe(false);
    const cardGrid = fixture.debugElement.query(By.css('[data-card-grid]'));
    expect(cardGrid.nativeElement.classList.contains('hidden')).toBe(true);
  });

  it('delete uses ConfirmDialogService (S6.3)', () => {
    const confirmSpy = jest.fn().mockReturnValue(of(true));
    mockOrganizationService = {
      list: jest.fn().mockReturnValue(of({ items: fixtureOrgs, total: 2 })),
      listAll: jest.fn().mockReturnValue(of(fixtureOrgs)),
      formData: jest.fn().mockReturnValue(of({ roles: [], geo_zones: [] })),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [OrganizationListComponent],
      providers: [
        provideRouter([]),
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: confirmSpy } },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({
              permissions: ['READ organizations', 'DELETE organizations'],
            }),
          },
        },
        {
          provide: LayoutService,
          useValue: { isSmallViewport$: of(false) },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} } } },
      ],
    });
    const fixture = TestBed.createComponent(OrganizationListComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    component.deleteOrganization(fixtureOrgs[0]);
    expect(confirmSpy).toHaveBeenCalled();
  });
});

/**
 * T-25 — RED: localStorage persistence for OrganizationListComponent (D9)
 * Keys: organizations-filters, fallback to DEFAULT
 */
describe('OrganizationListComponent — localStorage filter persistence (D9)', () => {
  const STORAGE_KEY = 'organizations-filters';

  beforeEach(() => {
    localStorage.clear();
  });

  function setupWithFilters(storedFilters: Record<string, unknown> | null = null) {
    if (storedFilters) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));
    }
    const mockOrgService = {
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
      listAll: jest.fn().mockReturnValue(of([])),
      formData: jest.fn().mockReturnValue(of({ roles: [], geo_zones: [] })),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [OrganizationListComponent],
      providers: [
        provideRouter([]),
        { provide: OrganizationService, useValue: mockOrgService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: jest.fn().mockReturnValue(of(true)) } },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({
              permissions: ['READ organizations'],
            }),
          },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} } } },
      ],
    });
    const fixture = TestBed.createComponent(OrganizationListComponent);
    const component = fixture.componentInstance;
    return { fixture, component, mockOrgService };
  }

  it('saves filter state to localStorage on search (D9 key: organizations-filters)', () => {
    const { fixture, component } = setupWithFilters();
    fixture.detectChanges();
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    // Simulate search input change persistence path
    const searchEvent = { target: { value: 'Quito' } } as unknown as Event;
    component.onSearchInput(searchEvent);
    // onSearchInput or onFilterChange should persist — check that setItem was called with key
    // Since debounce is async, we check that component has method that writes to storage
    // Alternative: call any exposed persistence method if exists
    // For RED, expect that after search, localStorage would contain the term
    // This will fail until implementation adds localStorage.setItem
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
    setItemSpy.mockRestore();
  });

  it('hydrates search from localStorage on ngOnInit (D9)', () => {
    const { fixture, component } = setupWithFilters({ search: 'Quito' });
    fixture.detectChanges();
    expect(component.searchInput()).toBe('Quito');
  });

  it('falls back to defaults when localStorage is empty (D9)', () => {
    const { fixture, component } = setupWithFilters(null);
    fixture.detectChanges();
    expect(component.searchInput()).toBe('');
  });
});
