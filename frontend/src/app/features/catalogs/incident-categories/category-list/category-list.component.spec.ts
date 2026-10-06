import { render, screen, fireEvent } from '@testing-library/angular';
import { CategoryListComponent } from './category-list.component';
import { IncidentCategoryService } from '../services/incident-category.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Helpers comunes para tests de doble-click en filas del árbol.
 */
function rowByName(name: string): HTMLElement | undefined {
  const rows = Array.from(document.querySelectorAll('tbody tr')) as HTMLElement[];
  return rows.find((r) => r.textContent?.includes(name));
}

function dispatchDblClick(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
}

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

    expect(screen.queryByText('Cat 1')).toBeTruthy();
    expect(screen.queryByText('Cat 2')).toBeTruthy();
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
    expect(screen.queryByText('Parent')).toBeTruthy();
    expect(screen.queryByText('Child 1')).toBeNull();
    expect(screen.queryByText('Child 2')).toBeNull();

    // Expand parent.
    const toggle = screen.getByTestId('category-toggle');
    fireEvent.click(toggle);

    expect(screen.queryByText('Child 1')).toBeTruthy();
    expect(screen.queryByText('Child 2')).toBeTruthy();
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

  // ── 2026-09-22-sc-tree-list-double-click-expand-catalog ─────────────
  // Doble-click en fila con hijos = toggle expand. Doble-click en hoja = no-op.

  describe('double-click on row', () => {
    beforeEach(() => {
      mockCategoryService.listAll.mockReturnValue(
        of([
          { id: 'p', name: 'Parent', description: null, parent_id: null, created_at: '', updated_at: '' },
          { id: 'c1', name: 'Child 1', description: null, parent_id: 'p', created_at: '', updated_at: '' },
          { id: 'c2', name: 'Child 2', description: null, parent_id: 'p', created_at: '', updated_at: '' },
        ]),
      );
    });

    it('applies the has-children class only to rows that have children', async () => {
      const { fixture } = await renderList();
      fixture.detectChanges();

      const parentRow = rowByName('Parent');
      const childRow = rowByName('Child 1');

      expect(parentRow).toBeTruthy();
      // Child rows are not rendered until parent is expanded.
      expect(childRow).toBeUndefined();

      // Parent must have has-children class (it has children, even if hidden).
      expect(parentRow!.classList.contains('has-children')).toBe(true);
    });

    it('toggles expand/collapse when double-clicking a row that has children', async () => {
      const { fixture } = await renderList();
      fixture.detectChanges();

      const parentRow = rowByName('Parent')!;
      const { componentInstance } = fixture;

      // Initially child rows are not in the DOM.
      expect(screen.queryByText('Child 1')).toBeNull();

      dispatchDblClick(parentRow);
      fixture.detectChanges();

      // After dblclick on parent, children become visible.
      expect(screen.queryByText('Child 1')).toBeTruthy();
      expect(screen.queryByText('Child 2')).toBeTruthy();
      // Toggle was actually called (state is expanded).
      expect(componentInstance.expandedIds().has('p')).toBe(true);

      // Second dblclick collapses again.
      dispatchDblClick(parentRow);
      fixture.detectChanges();
      expect(screen.queryByText('Child 1')).toBeNull();
      expect(componentInstance.expandedIds().has('p')).toBe(false);
    });

    it('does NOT expand when double-clicking a leaf row', async () => {
      mockCategoryService.listAll.mockReturnValue(
        of([
          { id: 'p', name: 'Parent', description: null, parent_id: null, created_at: '', updated_at: '' },
          { id: 'c', name: 'Child', description: null, parent_id: 'p', created_at: '', updated_at: '' },
        ]),
      );

      const { fixture } = await renderList();
      fixture.detectChanges();

      // Expand parent first so the leaf row becomes visible.
      const parentRow = rowByName('Parent')!;
      dispatchDblClick(parentRow);
      fixture.detectChanges();

      // Now there is a leaf row.
      const leafRow = rowByName('Child')!;
      expect(leafRow.classList.contains('has-children')).toBe(false);

      const toggleSpy = jest.spyOn(fixture.componentInstance, 'toggleExpand');

      dispatchDblClick(leafRow);
      fixture.detectChanges();

      // toggleExpand was not called for the leaf.
      expect(toggleSpy).not.toHaveBeenCalled();
    });
  });
});