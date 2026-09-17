import { render, screen, fireEvent } from '@testing-library/angular';
import { CategoryListComponent } from './category-list.component';
import { IncidentCategoryService } from '../services/incident-category.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

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

    const parentNode = form.rows()[0]; // not actually used — use the tree node
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