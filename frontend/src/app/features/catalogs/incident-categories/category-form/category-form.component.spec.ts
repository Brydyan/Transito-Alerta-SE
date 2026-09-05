import { TestBed } from '@angular/core/testing';
import { render, screen, fireEvent } from '@testing-library/angular';
import { CategoryFormComponent } from './category-form.component';
import { IncidentCategoryService } from '../services/incident-category.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';

describe('CategoryFormComponent', () => {
  let mockCategoryService: any;
  let mockToastService: any;
  let mockDialogService: any;
  let mockActivatedRoute: any;
  let mockRouter: any;

  beforeEach(() => {
    mockCategoryService = {
      create: jest.fn().mockReturnValue(of({ id: '1', name: 'Cat 1' })),
      getById: jest.fn().mockReturnValue(of({ id: '1', name: 'Cat 1' })),
      update: jest.fn().mockReturnValue(of({ id: '1', name: 'Cat 1' })),
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
});
