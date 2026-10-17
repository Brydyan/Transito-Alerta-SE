import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { FeedFiltersComponent } from './feed-filters.component';
import { IncidentCategoryService } from '../../../../catalogs/incident-categories/services/incident-category.service';
import { IIncidentCategory } from '../../../../catalogs/incident-categories/interfaces/iincident-category.interface';

/**
 * 2026-10-16-categories-chips-restructure — el filtro de categorías
 * pasó de un árbol recursivo tri-state (CategoryTreeNodeComponent) a
 * chips seleccionables con las 5 categorías raíz. La conexión con
 * el backend (`incident_category_id`) está wireada por primera vez
 * — el viejo `emitFilters()` tenía un DEBT que lo silenciaba.
 *
 * `setStatus` se conserva como estaba (status chips sin cambios).
 */
describe('FeedFiltersComponent — categories chips (2026-10-16)', () => {
  let component: FeedFiltersComponent;
  let fixture: ComponentFixture<FeedFiltersComponent>;
  let categoryServiceMock: { list: jest.Mock };

  const ROOTS: IIncidentCategory[] = [
    { id: 'cat-1', name: 'Siniestros Viales', parent_id: null } as IIncidentCategory,
    { id: 'cat-2', name: 'Infraestructura', parent_id: null } as IIncidentCategory,
    { id: 'cat-3', name: 'Eventos Masivos', parent_id: null } as IIncidentCategory,
    { id: 'cat-4', name: 'Otros', parent_id: null } as IIncidentCategory,
    { id: 'cat-5', name: 'Pruebas', parent_id: null } as IIncidentCategory,
  ];

  // Una subcategoría para confirmar que NO aparece como chip —
  // sólo las raíces (`parent_id === null`).
  const CHILD: IIncidentCategory = {
    id: 'cat-1-1',
    name: 'Choque simple',
    parent_id: 'cat-1',
  } as IIncidentCategory;

  beforeEach(async () => {
    categoryServiceMock = {
      list: jest.fn().mockReturnValue(of({
        items: [...ROOTS, CHILD],
        total: ROOTS.length + 1,
      })),
    };

    await TestBed.configureTestingModule({
      imports: [FeedFiltersComponent],
      providers: [
        { provide: IncidentCategoryService, useValue: categoryServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedFiltersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renderiza un chip por cada categoría raíz (sin subcategorías)', () => {
    const chips = fixture.nativeElement.querySelectorAll(
      '[data-testid^="category-chip-"]',
    );
    expect(chips.length).toBe(5);
    expect(component.rootCategories().map((c) => c.id)).toEqual([
      'cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5',
    ]);
  });

  it('click en chip → selectedCategoryId se actualiza y emitFilters dispara con incident_category_id', () => {
    const emissions: unknown[] = [];
    component.filtersChanged.subscribe((filters) => emissions.push(filters));

    component.setCategory('cat-1');

    expect(component.selectedCategoryId()).toBe('cat-1');
    expect(emissions.length).toBe(1);
    expect(emissions[0]).toEqual({
      status: undefined,
      incident_category_id: 'cat-1',
    });
  });

  it('click en chip ya seleccionado → deselecciona y emitFilters dispara sin incident_category_id', () => {
    const emissions: unknown[] = [];
    component.filtersChanged.subscribe((filters) => emissions.push(filters));

    component.setCategory('cat-1'); // selecciona
    component.setCategory('cat-1'); // toggle off

    expect(component.selectedCategoryId()).toBeNull();
    expect(emissions.length).toBe(2);
    expect(emissions[1]).toEqual({ status: undefined });
    expect((emissions[1] as Record<string, unknown>).incident_category_id).toBeUndefined();
  });

  it('CategoryTreeNodeComponent NO está en el DOM (reestructuración)', () => {
    const oldTree = fixture.nativeElement.querySelector('app-category-tree-node');
    expect(oldTree).toBeNull();
  });
});