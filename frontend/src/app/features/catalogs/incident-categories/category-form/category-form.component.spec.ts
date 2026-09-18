import { render, screen } from '@testing-library/angular';
import { CategoryFormComponent } from './category-form.component';
import { IncidentCategoryService } from '../services/incident-category.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';

describe('CategoryFormComponent', () => {
  let mockCategoryService: {
    create: jest.Mock;
    getById: jest.Mock;
    update: jest.Mock;
    getTree: jest.Mock;
  };
  let mockToastService: { success: jest.Mock; error: jest.Mock };
  let mockDialogService: { confirm: jest.Mock };
  let mockActivatedRoute: { snapshot: { paramMap: { get: () => string | null } } };
  let mockRouter: { navigate: jest.Mock };

  beforeEach(() => {
    mockCategoryService = {
      create: jest.fn().mockReturnValue(of({ id: '1', name: 'Cat 1' })),
      getById: jest.fn().mockReturnValue(
        of({
          id: '1',
          name: 'Cat 1',
          description: null,
          parent_id: null,
          created_at: '',
          updated_at: '',
        }),
      ),
      update: jest.fn().mockReturnValue(
        of({
          id: '1',
          name: 'Cat 1',
          description: null,
          parent_id: null,
          created_at: '',
          updated_at: '',
        }),
      ),
      // T7.4 — loadAvailableParents calls this. Default: empty tree.
      getTree: jest.fn().mockReturnValue(of([])),
    };
    mockToastService = {
      success: jest.fn(),
      error: jest.fn(),
    };
    mockDialogService = {
      confirm: jest.fn().mockReturnValue(of(true)),
    };
    mockActivatedRoute = {
      snapshot: { paramMap: { get: () => null } }, // default: create mode
    };
    mockRouter = {
      navigate: jest.fn(),
    };
  });

  it('blocks submission when form is invalid', async () => {
    const { fixture } = await render(CategoryFormComponent, {
      imports: [ReactiveFormsModule],
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const form = fixture.componentInstance;
    form.onSubmit();

    expect(mockCategoryService.create).not.toHaveBeenCalled();
    expect(form.form.invalid).toBe(true);
  });

  it('displays 422 server error mapped to a field', async () => {
    mockCategoryService.create.mockReturnValue(
      throwError(() => ({
        status: 422,
        error: { errors: { name: 'Name must be unique' } },
      })),
    );

    const { fixture } = await render(CategoryFormComponent, {
      imports: [ReactiveFormsModule],
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const form = fixture.componentInstance;
    form.form.patchValue({ name: 'Duplicate' });
    form.onSubmit();

    fixture.detectChanges();

    expect(form.serverErrors()['name']).toBe('Name must be unique');
    // We can also check if the UI displays it if we query the DOM,
    // but verifying the mapped signal state checks the core logic constraint.
    const errorMessage = screen.queryByText('Name must be unique');
    expect(errorMessage).toBeTruthy();
  });

  // ── sc-334-adjacent (T7.4) — hierarchy form ─────────────────────────────

  it('defaults to root mode on CREATE (parent dropdown hidden)', async () => {
    const { fixture } = await render(CategoryFormComponent, {
      imports: [ReactiveFormsModule],
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const form = fixture.componentInstance;
    expect(form.mode()).toBe('root');
    expect(form.isRoot()).toBe(true);
    expect(form.isSub()).toBe(false);

    fixture.detectChanges();
    // Parent select is gated by @if (isSub() && !isEditing()).
    expect(screen.queryByTestId('category-parent-select')).toBeNull();
  });

  it('switching to sub-category mode reveals the parent dropdown and requires parent_id', async () => {
    // The dropdown only renders when at least one root category exists;
    // pre-populate the tree with one root so the option appears.
    mockCategoryService.getTree.mockReturnValue(
      of([
        { id: 'root-1', name: 'Root A', children: [] },
      ]),
    );

    const { fixture } = await render(CategoryFormComponent, {
      imports: [ReactiveFormsModule],
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const form = fixture.componentInstance;
    form.setMode('sub');
    fixture.detectChanges();

    expect(form.isSub()).toBe(true);
    expect(form.parentIdControl.hasValidator).toBeTruthy?.();
    // The parent_id control now requires a value.
    expect(form.parentIdControl.errors?.['required']).toBeTruthy();
    // The select is now in the DOM.
    expect(screen.queryByTestId('category-parent-select')).not.toBeNull();
  });

  it('submits a sub-category with parent_id when mode=sub and parent selected', async () => {
    mockCategoryService.getTree.mockReturnValue(
      of([{ id: 'root-1', name: 'Root A', children: [] }]),
    );
    mockCategoryService.create.mockReturnValue(
      of({
        id: 'new-id',
        name: 'Sub A',
        description: 'desc',
        parent_id: 'root-1',
        created_at: '',
        updated_at: '',
      }),
    );

    const { fixture } = await render(CategoryFormComponent, {
      imports: [ReactiveFormsModule],
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const form = fixture.componentInstance;
    form.setMode('sub');
    fixture.detectChanges();
    form.form.patchValue({
      name: 'Sub A',
      description: 'desc',
      parent_id: 'root-1',
    });
    form.onSubmit();

    expect(mockCategoryService.create).toHaveBeenCalledWith({
      name: 'Sub A',
      description: 'desc',
      parent_id: 'root-1',
    });
    expect(mockToastService.success).toHaveBeenCalledWith(
      'Sub-categoría creada correctamente',
    );
  });

  it('submits a root category with parent_id=null when mode=root', async () => {
    const { fixture } = await render(CategoryFormComponent, {
      imports: [ReactiveFormsModule],
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const form = fixture.componentInstance;
    form.form.patchValue({ name: 'Root X', description: '' });
    form.onSubmit();

    expect(mockCategoryService.create).toHaveBeenCalledWith({
      name: 'Root X',
      description: null,
      parent_id: null,
    });
    expect(mockToastService.success).toHaveBeenCalledWith(
      'Categoría creada correctamente',
    );
  });

  it('on EDIT, derives mode from the loaded category and does not render the toggle', async () => {
    mockActivatedRoute = {
      snapshot: { paramMap: { get: ((k: string) => (k === 'id' ? 'sub-99' : null)) as any } },
    };
    mockCategoryService.getById.mockReturnValue(
      of({
        id: 'sub-99',
        name: 'Existing sub',
        description: 'preloaded',
        parent_id: 'root-1',
        created_at: '',
        updated_at: '',
      }),
    );

    const { fixture } = await render(CategoryFormComponent, {
      imports: [ReactiveFormsModule],
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const form = fixture.componentInstance;
    expect(form.isEditing()).toBe(true);
    expect(form.mode()).toBe('sub');
    fixture.detectChanges();
    // The radio type-selector must NOT be rendered in edit mode.
    expect(screen.queryByTestId('category-type-root')).toBeNull();
    expect(screen.queryByTestId('category-type-sub')).toBeNull();
    // Description field is pre-filled from the loaded category.
    expect(form.descriptionControl.value).toBe('preloaded');
  });
});
