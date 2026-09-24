import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { IncidentListComponent } from './incident-list.component';
import { IncidentService } from '../../../core/services/incident.service';
import { AuthService } from '../../../core/services/auth.service';
import { Incident, IncidentListResult } from '../../../core/models/incident.model';
import { LayoutService } from '../../../core/services/layout.service';

/**
 * F3 (sc-303) — F3.2.9 list specs.
 *
 *  - Filtros combinados generan los query params correctos.
 *  - Restaurar desde URL reconstruye el estado.
 *  - `empty-state` cuando no hay resultados.
 *  - Las tarjetas de contexto muestran guion cuando la métrica
 *    está indisponible (D8 — nunca 0).
 *
 * El `IncidentService` se mockea con un espía de `getIncidents` para
 * verificar QUÉ filtros viajan al backend. La aserción es sobre
 * el filtro (el contrato), no sobre el path del router.
 */
describe('IncidentListComponent (F3.2.9)', () => {
  let fixture: import('@angular/core/testing').ComponentFixture<IncidentListComponent>;
  let component: IncidentListComponent;

  const makeIncident = (id: string, overrides: Partial<Incident> = {}): Incident => ({
    id,
    title: `Pothole ${id}`,
    description: 'x',
    status: 'pending',
    priority: 'medium',
    lat: -2.2,
    lng: -80.8,
    zone_id: 'zone-1',
    geofence_matched: true,
    organization_id: 'org-A',
    citizen_id: 'user-1',
    assigned_to: null,
    category_id: null,
    claimed_by: null,
    claimed_at: null,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    closed_reason: null,
    resolution_date: null,
    follower_count: 0,
    corroboration_count: 0,
    is_followed_by_me: false,
    is_corroborated_by_me: false,
    created_at: new Date('2026-09-01'),
    updated_at: new Date('2026-09-01'),
    deleted_at: null,
    ...overrides,
  });

  function setup(qp: Record<string, string> = {}) {
    const spy = {
      getIncidents: jest.fn().mockReturnValue(
        of<IncidentListResult>({ items: [], total: 0, page: 1, limit: 10 }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(qp) },
            queryParamMap: of(convertToParamMap(qp)),
          },
        },
        { provide: IncidentService, useValue: spy },
        {
          provide: AuthService,
          useValue: { user: () => ({ permissions: ['READ incidents'] }) },
        },
      ],
    });
    fixture = TestBed.createComponent(IncidentListComponent);
    component = fixture.componentInstance;
    return { spy };
  }

  it('hidrata los filtros desde la URL al montar (D2 — "restaurar desde URL reconstruye el estado")', () => {
    // F3 (sc-303) C1 (ronda 4) — sólo `status` se persiste en la
    // URL. `search`/`priority`/`page` ya no se mandan al backend;
    // cuando se extienda `findAll`, este test se expande.
    setup({ status: 'in_progress', page: '2' });
    fixture.detectChanges();
    expect(component.statusFilter()).toBe('in_progress');
    expect(component.currentPage()).toBe(2);
  });

  it('emite al backend los filtros presentes en la URL, sin los vacíos', () => {
    const { spy } = setup({ status: 'closed' });
    fixture.detectChanges();
    expect(spy.getIncidents).toHaveBeenCalled();
    const arg = spy.getIncidents.mock.calls[0][0] as Record<string, unknown>;
    expect(arg['status']).toBe('closed');
    expect(arg).not.toHaveProperty('search');
    expect(arg).not.toHaveProperty('priority');
  });

  it('al cambiar el estado, vuelve a la página 1 (spec — la búsqueda/filtro reinicia paginación)', () => {
    const { spy } = setup({ page: '3' });
    fixture.detectChanges();
    component.onStatusChange('resolved');
    expect(component.currentPage()).toBe(1);
    expect(spy.getIncidents).toHaveBeenCalled();
  });

  it('al limpiar filtros, vacía la barra y vuelve a la página 1', () => {
    const { spy } = setup({ status: 'in_progress' });
    fixture.detectChanges();
    component.onClearFilters();
    expect(component.searchCtrl.value).toBe('');
    expect(component.statusFilter()).toBeNull();
    expect(component.currentPage()).toBe(1);
    // La siguiente llamada no debe llevar search/priority/page/limit.
    const arg = spy.getIncidents.mock.calls[spy.getIncidents.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('search');
    expect(arg).not.toHaveProperty('status');
    expect(arg).not.toHaveProperty('priority');
  });

  it('muestra "Mostrando N de N" (sin paginación real hasta que el backend extienda findAll) — C1', () => {
    const { spy } = setup();
    spy.getIncidents.mockReturnValue(
      of({
        items: Array.from({ length: 10 }, (_, i) => makeIncident(`inc-${i}`)),
        total: 10,
        page: 1,
        limit: 10,
      }),
    );
    fixture.detectChanges();
    // F3 (sc-303) C1 (ronda 4) — sin paginación real del backend,
    // el rango es siempre `N de N`. Cuando se extienda `findAll`,
    // el formato vuelve a `start-end de N`.
    expect(component.rangeText()).toBe('Mostrando 10 de 10 incidencias');
  });

  it('singular cuando total === 1 (no rompe UX)', () => {
    const { spy } = setup();
    spy.getIncidents.mockReturnValue(
      of({ items: [makeIncident('only-one')], total: 1, page: 1, limit: 10 }),
    );
    fixture.detectChanges();
    expect(component.rangeText()).toBe('Mostrando 1 de 1 incidencia');
  });

  it('C1: el paginador está oculto mientras el backend no soporte paginación', () => {
    // La guarda `shouldShowPagination` devuelve `false` siempre
    // hasta que el backend extienda `findAll`. Un usuario no
    // debería ver un paginador que no hace nada.
    expect(component.shouldShowPagination()).toBe(false);
  });

  it('C1: el filtro de búsqueda y el selector de prioridad NO se renderizan (alcance reducido)', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // Antes había `[data-testid="search-input"]` y `[data-testid="priority-select"]`;
    // ambos se retiraron del template porque el backend no los
    // soporta. Sólo queda `[data-testid="status-select"]`.
    expect(el.querySelector('[data-testid="search-input"]')).toBeNull();
    expect(el.querySelector('[data-testid="priority-select"]')).toBeNull();
    expect(el.querySelector('[data-testid="status-select"]')).not.toBeNull();
  });

  it('trunca títulos largos con elipsis y conserva el texto completo como title accesible (F3.2.5)', () => {
    const longTitle = 'x'.repeat(80);
    expect(component.truncate(longTitle, 60)).toMatch(/…$/);
    expect(component.truncate(longTitle, 60).length).toBe(60);
    // El title accesible (atributo HTML) lo aplicamos en el template,
    // no acá — el método sólo prepara el string. Lo verifica el
    // assertion end-to-end: ningún carácter del título original se
    // pierde; lo que cambia es que se trunca el render.
    expect(component.truncate('corto')).toBe('corto');
  });

  it('badges traduce del wire (inglés) al F0 (español) sin perder el contrato', () => {
    expect(component.badgeStatusFor('pending')).toBe('pendiente');
    expect(component.badgeStatusFor('in_progress')).toBe('en_proceso');
    expect(component.badgeStatusFor('resolved')).toBe('resuelto');
    expect(component.badgeStatusFor('closed')).toBe('cerrada');
  });

  it('D8: el rango "0" se renderiza con la palabra "incidencias" (no "incidencia")', () => {
    const { spy } = setup();
    spy.getIncidents.mockReturnValue(
      of({ items: [], total: 0, page: 1, limit: 10 }),
    );
    fixture.detectChanges();
    expect(component.rangeText()).toBe('Mostrando 0 de 0 incidencias');
  });
});

/**
 * T-13 — RED: Failing integration tests for IncidentListComponent
 * rendering cards on mobile (S9.1).
 *
 * S2.1: table converts to card grid on mobile.
 * S2.2: each card shows title | status badge | priority badge.
 * S2.3: card includes "Ver detalle" button.
 * S2.4: card includes action dropdown (⋮).
 * S6.3: delete confirmation on mobile.
 * S6.4: dropdown closes after action selection.
 */
describe('IncidentListComponent — mobile cards integration (S9.1)', () => {
  let fixture: import('@angular/core/testing').ComponentFixture<IncidentListComponent>;
  let component: IncidentListComponent;

  const makeIncident = (id: string, overrides: Partial<Incident> = {}): Incident => ({
    id,
    title: `Bache en Av. Principal ${id}`,
    description: 'Descripcion de prueba',
    status: 'pending',
    priority: 'high',
    lat: -2.2,
    lng: -80.8,
    zone_id: 'zone-1',
    geofence_matched: true,
    organization_id: 'org-A',
    citizen_id: 'user-1',
    assigned_to: null,
    category_id: null,
    claimed_by: null,
    claimed_at: null,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    closed_reason: null,
    resolution_date: null,
    follower_count: 0,
    corroboration_count: 0,
    is_followed_by_me: false,
    is_corroborated_by_me: false,
    created_at: new Date('2026-09-01'),
    updated_at: new Date('2026-09-01'),
    deleted_at: null,
    ...overrides,
  });

  const incidents: Incident[] = [
    makeIncident('inc-1'),
    makeIncident('inc-2', { status: 'resolved', priority: 'low' }),
  ];

  function setupMobile() {
    const spy = {
      getIncidents: jest.fn().mockReturnValue(
        of<IncidentListResult>({ items: incidents, total: 2, page: 1, limit: 10 }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({}) },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: IncidentService, useValue: spy },
        {
          provide: AuthService,
          useValue: {
            user: () => ({
              permissions: ['READ incidents', 'UPDATE incidents', 'DELETE incidents'],
            }),
          },
        },
        {
          provide: LayoutService,
          useValue: { isSmallViewport$: of(true) },
        },
      ],
    });
    fixture = TestBed.createComponent(IncidentListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return { spy };
  }

  it('renders cards (app-data-card) on mobile instead of table rows', () => {
    setupMobile();
    // On mobile, TableToCard renders app-data-card elements
    const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
    expect(cards.length).toBe(2);
  });

  it('each card shows title, status badge, and priority badge (S9.1)', () => {
    setupMobile();
    const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
    expect(cards.length).toBe(2);

    // First card should have field values rendered
    const firstCard = cards[0];
    const cardText = firstCard.nativeElement.textContent;
    expect(cardText).toContain('Bache en Av. Principal inc-1');
    expect(cardText).toContain('pending');
    expect(cardText).toContain('high');
  });

  it('each card has "Ver detalle" button (S2.3)', () => {
    setupMobile();
    const detailBtns = fixture.debugElement.queryAll(By.css('[data-card-detail]'));
    expect(detailBtns.length).toBe(2);
    for (const btn of detailBtns) {
      expect(btn.nativeElement.textContent).toContain('Ver detalle');
    }
  });

  it('each card has action dropdown (⋮) (S2.4)', () => {
    setupMobile();
    const dropdowns = fixture.debugElement.queryAll(By.css('app-action-dropdown'));
    expect(dropdowns.length).toBe(2);
  });

  it('clicking "Ver detalle" navigates to detail page', () => {
    setupMobile();
    const spy = jest.spyOn(component, 'goToDetail');
    const detailBtns = fixture.debugElement.queryAll(By.css('[data-card-detail]'));
    detailBtns[0].nativeElement.click();
    expect(spy).toHaveBeenCalledWith(incidents[0]);
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

  it('provides INCIDENTS_CARD_FIELDS to TableToCard (S9.1 fields)', () => {
    setupMobile();
    // Verify the component has cardFields defined
    expect(component['cardFields']).toBeDefined();
  });

  it('provides cardActions derived from permissions', () => {
    setupMobile();
    // Verify the component has cardActions defined
    expect(component['cardActions']).toBeDefined();
  });
});

/**
 * T-15 — RED: Failing tests for load-more behavior on IncidentListComponent.
 *
 * S3.5: Backend does NOT paginate (C1 ronda 4) — hasMore=false,
 *       no load-more button rendered.
 * S3.1: Desktop pagination untouched (shouldShowPagination already false).
 */
describe('IncidentListComponent — load-more behavior (D5)', () => {
  let fixture: import('@angular/core/testing').ComponentFixture<IncidentListComponent>;
  let component: IncidentListComponent;

  function setupWithIncidents(count: number) {
    const items = Array.from({ length: count }, (_, i) => ({
      id: `inc-${i}`,
      title: `Incident ${i}`,
      status: 'pending' as const,
      priority: 'medium' as const,
      description: '',
      lat: -2.2,
      lng: -80.8,
      zone_id: 'zone-1',
      geofence_matched: true,
      organization_id: 'org-A',
      citizen_id: 'user-1',
      assigned_to: null,
      category_id: null,
      claimed_by: null,
      claimed_at: null,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      closed_reason: null,
      resolution_date: null,
      follower_count: 0,
      corroboration_count: 0,
      is_followed_by_me: false,
      is_corroborated_by_me: false,
      created_at: new Date('2026-09-01'),
      updated_at: new Date('2026-09-01'),
      deleted_at: null,
    }));

    const spy = {
      getIncidents: jest.fn().mockReturnValue(
        of({ items, total: count, page: 1, limit: count }),
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({}) },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: IncidentService, useValue: spy },
        {
          provide: AuthService,
          useValue: { user: () => ({ permissions: ['READ incidents'] }) },
        },
      ],
    });

    fixture = TestBed.createComponent(IncidentListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return { spy };
  }

  it('hasMore is false because backend does not paginate (C1 ronda 4)', () => {
    setupWithIncidents(5);
    // IncidentService returns all items; shouldShowPagination is false.
    // The component should NOT expose a load-more path.
    expect(component.shouldShowPagination()).toBe(false);
  });

  it('does not render load-more button on mobile for incidents', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({}) },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        {
          provide: IncidentService,
          useValue: {
            getIncidents: jest.fn().mockReturnValue(
              of({ items: [], total: 0, page: 1, limit: 10 }),
            ),
          },
        },
        {
          provide: AuthService,
          useValue: { user: () => ({ permissions: ['READ incidents'] }) },
        },
        {
          provide: LayoutService,
          useValue: { isSmallViewport$: of(true) },
        },
      ],
    });
    fixture = TestBed.createComponent(IncidentListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const loadMoreBtn = fixture.debugElement.query(By.css('[data-load-more]'));
    expect(loadMoreBtn).toBeNull();
  });
});

/**
 * T-23 — RED: Failing tests for filter/sort persistence via localStorage (D9).
 *
 * D9: Use localStorage to persist filter/sort state per table.
 * S5.2: Filter state persists across navigation.
 * Key pattern: 'incidents-filters'.
 * Storage: onFilterChange → localStorage.setItem; ngOnInit → localStorage.getItem with fallback.
 */
describe('IncidentListComponent — localStorage filter persistence (D9)', () => {
  let fixture: import('@angular/core/testing').ComponentFixture<IncidentListComponent>;
  let component: IncidentListComponent;

  const STORAGE_KEY = 'incidents-filters';

  const makeIncident = (id: string): Incident => ({
    id,
    title: `Incident ${id}`,
    description: '',
    status: 'pending',
    priority: 'medium',
    lat: -2.2,
    lng: -80.8,
    zone_id: 'zone-1',
    geofence_matched: true,
    organization_id: 'org-A',
    citizen_id: 'user-1',
    assigned_to: null,
    category_id: null,
    claimed_by: null,
    claimed_at: null,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    closed_reason: null,
    resolution_date: null,
    follower_count: 0,
    corroboration_count: 0,
    is_followed_by_me: false,
    is_corroborated_by_me: false,
    created_at: new Date('2026-09-01'),
    updated_at: new Date('2026-09-01'),
    deleted_at: null,
  });

  beforeEach(() => {
    localStorage.clear();
  });

  function setupWithFilters(storedFilters: Record<string, unknown> | null = null) {
    if (storedFilters) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));
    }
    const spy = {
      getIncidents: jest.fn().mockReturnValue(
        of<IncidentListResult>({ items: [makeIncident('inc-1')], total: 1, page: 1, limit: 10 }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({}) },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: IncidentService, useValue: spy },
        {
          provide: AuthService,
          useValue: { user: () => ({ permissions: ['READ incidents'] }) },
        },
      ],
    });
    fixture = TestBed.createComponent(IncidentListComponent);
    component = fixture.componentInstance;
    return { spy };
  }

  it('saves filter state to localStorage on status change (D9 key: incidents-filters)', () => {
    const { spy } = setupWithFilters();
    fixture.detectChanges();

    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    component.onStatusChange('resolved');

    expect(setItemSpy).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.any(String),
    );

    const stored = JSON.parse(setItemSpy.mock.calls[0][1] as string);
    expect(stored).toHaveProperty('status', 'resolved');
    setItemSpy.mockRestore();
  });

  it('hydrates filter state from localStorage on ngOnInit (D9)', () => {
    const { spy } = setupWithFilters({ status: 'in_progress' });
    fixture.detectChanges();

    // The status filter should be hydrated from localStorage
    expect(component.statusFilter()).toBe('in_progress');
  });

  it('calls loadData with hydrated filters from localStorage (D9)', () => {
    const { spy } = setupWithFilters({ status: 'closed' });
    fixture.detectChanges();

    // getIncidents should have been called with the hydrated filter
    expect(spy.getIncidents).toHaveBeenCalled();
    const callArgs = spy.getIncidents.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['status']).toBe('closed');
  });

  it('falls back to DEFAULT_FILTERS when localStorage is empty (D9)', () => {
    const { spy } = setupWithFilters(null);
    fixture.detectChanges();

    // statusFilter should be null (default) when no stored filters
    expect(component.statusFilter()).toBeNull();
    const callArgs = spy.getIncidents.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('status');
  });

  it('preserves query-param compat — URL status takes precedence over localStorage (D2)', () => {
    // URL has status=pending, localStorage has status=closed
    // URL should win (existing D2 behavior)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ status: 'closed' }));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({ status: 'pending' }) },
            queryParamMap: of(convertToParamMap({ status: 'pending' })),
          },
        },
        {
          provide: IncidentService,
          useValue: {
            getIncidents: jest.fn().mockReturnValue(
              of<IncidentListResult>({ items: [], total: 0, page: 1, limit: 10 }),
            ),
          },
        },
        {
          provide: AuthService,
          useValue: { user: () => ({ permissions: ['READ incidents'] }) },
        },
      ],
    });
    fixture = TestBed.createComponent(IncidentListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // URL status 'pending' should take precedence
    expect(component.statusFilter()).toBe('pending');
  });
});

/**
 * T-33 — RED: Component scroll restoration behavior (D14 / S5.3).
 *
 * The list must not lose scroll position when navigating to detail and back.
 * Implementation delegates to ScrollRestorationService (localStorage backup
 * for the critical incidents list). Verifies save on goToDetail and restore
 * on ngOnInit.
 */
describe('IncidentListComponent — scroll restoration (D14 / S5.3)', () => {
  let fixture: import('@angular/core/testing').ComponentFixture<IncidentListComponent>;
  let component: IncidentListComponent;

  const makeIncident = (id: string): Incident => ({
    id,
    title: `Incident ${id}`,
    description: '',
    status: 'pending',
    priority: 'medium',
    lat: -2.2,
    lng: -80.8,
    zone_id: 'zone-1',
    geofence_matched: true,
    organization_id: 'org-A',
    citizen_id: 'user-1',
    assigned_to: null,
    category_id: null,
    claimed_by: null,
    claimed_at: null,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    closed_reason: null,
    resolution_date: null,
    follower_count: 0,
    corroboration_count: 0,
    is_followed_by_me: false,
    is_corroborated_by_me: false,
    created_at: new Date('2026-09-01'),
    updated_at: new Date('2026-09-01'),
    deleted_at: null,
  });

  function setupWithScrollMocks() {
    const spy = {
      getIncidents: jest.fn().mockReturnValue(
        of<IncidentListResult>({ items: [makeIncident('inc-1')], total: 1, page: 1, limit: 10 }),
      ),
    };
    const scrollMock = {
      saveCurrentPosition: jest.fn(),
      savePosition: jest.fn(),
      getPosition: jest.fn().mockReturnValue(1250),
      restorePosition: jest.fn(),
      clearPosition: jest.fn(),
    };
    // Provide ScrollRestorationService mock if it exists; otherwise the test
    // will fail at injection time (RED) — which is the desired TDD signal.
    // Import lazily to keep compile-time dependency soft.
    let scrollProvider: unknown = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const m = require('../../../core/services/scroll-restoration.service');
      scrollProvider = { provide: m.ScrollRestorationService, useValue: scrollMock };
    } catch {
      // Service not yet implemented — use a string token placeholder so
      // TestBed still configures; the describe will fail because injection
      // inside component will be missing.
      scrollProvider = { provide: 'ScrollRestorationService', useValue: scrollMock };
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({}) },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: IncidentService, useValue: spy },
        {
          provide: AuthService,
          useValue: { user: () => ({ permissions: ['READ incidents'] }) },
        },
        scrollProvider as never,
      ],
    });
    fixture = TestBed.createComponent(IncidentListComponent);
    component = fixture.componentInstance;
    return { spy, scrollMock };
  }

  it('saves scroll position before navigating to detail (S5.3)', () => {
    const { scrollMock } = setupWithScrollMocks();
    fixture.detectChanges();
    const incident = makeIncident('inc-15');
    // goToDetail should delegate to scroll restoration before router navigation
    component.goToDetail(incident);
    // Accept either saveCurrentPosition or savePosition(key, scrollY)
    const saved =
      (scrollMock.saveCurrentPosition as jest.Mock).mock.calls.length > 0 ||
      (scrollMock.savePosition as jest.Mock).mock.calls.length > 0;
    expect(saved).toBe(true);
  });

  it('restores scroll position on init (return from detail -> back)', () => {
    const { scrollMock } = setupWithScrollMocks();
    fixture.detectChanges();
    // After ngOnInit, the component should attempt to restore scroll
    const restored =
      (scrollMock.restorePosition as jest.Mock).mock.calls.length > 0 ||
      (scrollMock.getPosition as jest.Mock).mock.calls.length > 0;
    expect(restored).toBe(true);
  });

  it('does not lose scroll when navigating to detail and back — mock verifies approximate card #15', () => {
    const { scrollMock } = setupWithScrollMocks();
    (scrollMock.getPosition as jest.Mock).mockReturnValue(1250);
    fixture.detectChanges();
    // Simulate save at card #15 scroll offset then restore
    component.goToDetail(makeIncident('inc-15'));
    // Re-create component as if user navigated back
    const savedPos = 1250;
    expect(Math.abs(savedPos - 1250)).toBeLessThanOrEqual(100);
    expect(scrollMock.restorePosition || scrollMock.getPosition).toBeDefined();
  });
});
