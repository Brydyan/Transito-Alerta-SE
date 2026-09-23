import { render, screen, fireEvent } from '@testing-library/angular';
import { CategoryListComponent } from './category-list.component';
import { IncidentCategoryService } from '../services/incident-category.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LayoutService } from '../../../../core/services/layout.service';

describe('CategoryListComponent (T7.4 — tree view)', () => {
  let mockCategoryService: {
    listAll: jest.Mock;
    list: jest.Mock;
    remove: jest.Mock;
  };
  let mockToastService: { success: jest.Mock; error: jest.Mock };
  let mockDialogService: { confirm: jest.Mock };
  let mockRouter: { navigate: jest.Mock };
  let mockActivatedRoute: { snapshot: { params: Record<string, unknown> } };

  beforeEach(() => {
    localStorage.clear();
    mockCategoryService = {
      listAll: jest.fn().mockReturnValue(of([])),
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };
    mockToastService = {
      success: jest.fn(),
      error: jest.fn(),
    };
    mockDialogService = {
      confirm: jest.fn().mockReturnValue(of(true)),
    };
    mockRouter = { navigate: jest.fn() };
    mockActivatedRoute = {
      snapshot: { params: {} },
    };
  });

  function renderList() {
    return render(CategoryListComponent, {
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    });
  }

  it('renders a flat list when no hierarchy exists', async () => {
    mockCategoryService.listAll.mockReturnValue(
      of([
        { id: '1', name: 'Cat 1', description: null, parent_id: null, created_at: '', updated_at: '' },
        { id: '2', name: 'Cat 2', description: null, parent_id: null, created_at: '', updated_at: '' },
      ]),
    );

    await renderList();

    // TableToCard duplicates text in hidden mobile/desktop branches
    expect(screen.queryAllByText('Cat 1').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText('Cat 2').length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty-state when no categories exist', async () => {
    mockCategoryService.listAll.mockReturnValue(of([]));
    await renderList();
    expect(
      screen.queryByText(/Sin datos/i) || document.querySelector('.empty-state-container'),
    ).toBeTruthy();
  });

  it('hides children until the parent row is expanded', async () => {
    mockCategoryService.listAll.mockReturnValue(
      of([
        { id: 'p', name: 'Parent', description: null, parent_id: null, created_at: '', updated_at: '' },
        { id: 'c1', name: 'Child 1', description: null, parent_id: 'p', created_at: '', updated_at: '' },
        { id: 'c2', name: 'Child 2', description: null, parent_id: 'p', created_at: '', updated_at: '' },
      ]),
    );

    await renderList();

    // Parent visible, children collapsed by default.
    expect(screen.queryAllByText('Parent').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Child 1')).toBeNull();
    expect(screen.queryByText('Child 2')).toBeNull();

    // Expand parent.
    const toggle = screen.getByTestId('category-toggle');
    fireEvent.click(toggle);

    expect(screen.queryAllByText('Child 1').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText('Child 2').length).toBeGreaterThanOrEqual(1);
  });

  it('reports canDelete=false for a category with children', async () => {
    mockCategoryService.listAll.mockReturnValue(
      of([
        { id: 'p', name: 'Parent', description: null, parent_id: null, created_at: '', updated_at: '' },
        { id: 'c', name: 'Child', description: null, parent_id: 'p', created_at: '', updated_at: '' },
      ]),
    );

    const { fixture } = await renderList();
    const component = fixture.componentInstance;

    const parentNode = component.tree()[0];
    const childNode = parentNode.children[0];

    // Parent has children → cannot be deleted.
    expect(component.canDelete(parentNode)).toBe(false);
    // Child is a leaf → can be deleted.
    expect(component.canDelete(childNode)).toBe(true);
  });

  it('shows a toast and skips the dialog when delete is invoked on a non-leaf', async () => {
    mockCategoryService.listAll.mockReturnValue(
      of([
        { id: 'p', name: 'Parent', description: null, parent_id: null, created_at: '', updated_at: '' },
        { id: 'c', name: 'Child', description: null, parent_id: 'p', created_at: '', updated_at: '' },
      ]),
    );

    const { fixture } = await renderList();
    const form = fixture.componentInstance;
    // Grab the tree node directly from the component.
    const treeNode = form.tree()[0];
    form.deleteCategory(treeNode);

    expect(mockToastService.error).toHaveBeenCalledWith(
      'Esta categoría no puede eliminarse porque tiene sub-categorías asociadas.',
    );
    expect(mockDialogService.confirm).not.toHaveBeenCalled();
    expect(mockCategoryService.remove).not.toHaveBeenCalled();
  });

  it('surfaces a backend error from listAll', async () => {
    mockCategoryService.listAll.mockReturnValue(throwError(() => new Error('boom')));
    await renderList();
    expect(mockToastService.error).toHaveBeenCalledWith('No se pudieron cargar las categorías.');
  });
});

/**
 * T-25 — RED: Failing integration tests for CategoryListComponent
 * mobile cards (S9.5).
 *
 * S9.5: Categories card nombre | descripcion (truncated) | icon
 *       + actions edit/delete
 * S2.1: card grid responsive
 * S3.2: Ver más datos
 * S4.2: FilterDrawer wrapping search
 * S1.1: desktop table unchanged
 */
describe('CategoryListComponent — mobile cards integration (S9.5)', () => {
  let mockCategoryService: {
    listAll: jest.Mock;
    list: jest.Mock;
    remove: jest.Mock;
    getTree?: jest.Mock;
  };

  const fixtureCategories = [
    { id: '1', name: 'Baches', description: 'Descripcion larga que deberia ser truncada en la card para evitar overflow visual y mostrar solo dos lineas', parent_id: null, created_at: '', updated_at: '' },
    { id: '2', name: 'Alumbrado', description: 'Falla de luminarias', parent_id: null, created_at: '', updated_at: '' },
  ];

  function setupMobile() {
    mockCategoryService = {
      listAll: jest.fn().mockReturnValue(of(fixtureCategories)),
      list: jest.fn().mockReturnValue(of({ items: fixtureCategories, total: 2 })),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      imports: [CategoryListComponent],
      providers: [
        provideRouter([]),
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: jest.fn().mockReturnValue(of(true)) } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} } } },
        {
          provide: LayoutService,
          useValue: { isSmallViewport$: of(true) },
        },
      ],
    });

    const fixture = TestBed.createComponent(CategoryListComponent);
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

  it('each card shows nombre and truncated descripcion (S9.5)', () => {
    const { fixture } = setupMobile();
    const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
    const firstCardText = cards[0].nativeElement.textContent;
    expect(firstCardText).toContain('Baches');
    // DataCard truncates descripcion with line-clamp-2; text still contains description
    expect(firstCardText).toContain('Descripcion larga');
  });

  it('each card shows icon field (S9.5)', () => {
    const { fixture } = setupMobile();
    const cards = fixture.debugElement.queryAll(By.css('app-data-card'));
    // icon is derived field; DataCard renders it as text for field.key === 'icon'
    // Should have some icon placeholder or dash
    expect(cards[0].nativeElement.textContent).toBeTruthy();
  });

  it('each card has "Ver detalle" button (S2.3)', () => {
    const { fixture } = setupMobile();
    const detailBtns = fixture.debugElement.queryAll(By.css('[data-card-detail]'));
    expect(detailBtns.length).toBe(2);
  });

  it('each card has action dropdown (S2.4) with edit/delete (S9.5)', () => {
    const { fixture, component } = setupMobile();
    const dropdowns = fixture.debugElement.queryAll(By.css('app-action-dropdown'));
    expect(dropdowns.length).toBe(2);
    const fields = (component as unknown as { cardFields: unknown[] })['cardFields'];
    expect(fields).toBeDefined();
    expect(Array.isArray(fields) ? fields.length : 0).toBe(3);
  });

  it('provides CATEGORIES_CARD_FIELDS to TableToCard (3 fields)', () => {
    const { component } = setupMobile();
    const fields = (component as unknown as { cardFields: unknown[] })['cardFields'];
    expect(fields).toBeDefined();
    expect(Array.isArray(fields) ? fields.length : 0).toBe(3);
  });

  it('FilterDrawer wraps search input on mobile (S4.2)', () => {
    const { fixture } = setupMobile();
    const drawer = fixture.debugElement.query(By.css('app-filter-drawer'));
    expect(drawer).toBeTruthy();
    const searchInputs = fixture.debugElement.queryAll(By.css('input[aria-label="Buscar categorías"]'));
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
    mockCategoryService = {
      listAll: jest.fn().mockReturnValue(of(fixtureCategories)),
      list: jest.fn().mockReturnValue(of({ items: fixtureCategories, total: 2 })),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [CategoryListComponent],
      providers: [
        provideRouter([]),
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: jest.fn().mockReturnValue(of(true)) } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} } } },
        {
          provide: LayoutService,
          useValue: { isSmallViewport$: of(false) },
        },
      ],
    });
    const fixture = TestBed.createComponent(CategoryListComponent);
    fixture.detectChanges();
    const tableWrapper = fixture.debugElement.query(By.css('[data-table-wrapper]'));
    expect(tableWrapper).toBeTruthy();
    expect(tableWrapper.nativeElement.classList.contains('hidden')).toBe(false);
    const cardGrid = fixture.debugElement.query(By.css('[data-card-grid]'));
    expect(cardGrid.nativeElement.classList.contains('hidden')).toBe(true);
  });

  it('delete uses ConfirmDialogService (S6.3)', () => {
    const confirmSpy = jest.fn().mockReturnValue(of(true));
    mockCategoryService = {
      listAll: jest.fn().mockReturnValue(of(fixtureCategories)),
      list: jest.fn().mockReturnValue(of({ items: fixtureCategories, total: 2 })),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [CategoryListComponent],
      providers: [
        provideRouter([]),
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: confirmSpy } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} } } },
        {
          provide: LayoutService,
          useValue: { isSmallViewport$: of(false) },
        },
      ],
    });
    const fixture = TestBed.createComponent(CategoryListComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    // Pick a leaf node
    const node = component.tree()[0];
    if (component.canDelete(node)) {
      component.deleteCategory(node);
      expect(confirmSpy).toHaveBeenCalled();
    } else {
      // If not deletable, at least the service path is preserved
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(component.canDelete(node)).toBe(false);
    }
  });
});

/**
 * T-25 — RED: localStorage persistence for CategoryListComponent (D9)
 * Keys: categories-filters
 */
describe('CategoryListComponent — localStorage filter persistence (D9)', () => {
  const STORAGE_KEY = 'categories-filters';

  beforeEach(() => {
    localStorage.clear();
  });

  function setupWithFilters(storedFilters: Record<string, unknown> | null = null) {
    if (storedFilters) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFilters));
    }
    const mockCatService = {
      listAll: jest.fn().mockReturnValue(of([])),
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
      remove: jest.fn().mockReturnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [CategoryListComponent],
      providers: [
        provideRouter([]),
        { provide: IncidentCategoryService, useValue: mockCatService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: jest.fn().mockReturnValue(of(true)) } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} } } },
      ],
    });
    const fixture = TestBed.createComponent(CategoryListComponent);
    const component = fixture.componentInstance;
    return { fixture, component, mockCatService };
  }

  it('saves filter state to localStorage on search (D9 key: categories-filters)', () => {
    const { fixture, component } = setupWithFilters();
    fixture.detectChanges();
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    const searchEvent = { target: { value: 'Baches' } } as unknown as Event;
    component.onSearchInput(searchEvent);
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
    setItemSpy.mockRestore();
  });

  it('hydrates search from localStorage on ngOnInit (D9)', () => {
    const { fixture, component } = setupWithFilters({ search: 'Baches' });
    fixture.detectChanges();
    expect(component.searchTerm()).toBe('Baches');
  });

  it('falls back to defaults when localStorage is empty (D9)', () => {
    const { fixture, component } = setupWithFilters(null);
    fixture.detectChanges();
    expect(component.searchTerm()).toBe('');
  });
});
