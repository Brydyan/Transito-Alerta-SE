import { TestBed } from '@angular/core/testing';
import { render, screen, fireEvent } from '@testing-library/angular';
import { CategoryListComponent } from './category-list.component';
import { IncidentCategoryService } from '../services/incident-category.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';

describe('CategoryListComponent', () => {
  let mockCategoryService: any;
  let mockToastService: any;
  let mockDialogService: any;
  let mockActivatedRoute: any;

  beforeEach(() => {
    mockCategoryService = {
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
    mockActivatedRoute = {
      snapshot: { params: {} },
    };
  });

  it('renders rows for fetched categories', async () => {
    mockCategoryService.list.mockReturnValue(
      of({
        items: [
          { id: '1', name: 'Cat 1', created_at: '', updated_at: '', parent_id: null },
          { id: '2', name: 'Cat 2', created_at: '', updated_at: '', parent_id: null },
        ],
        total: 2,
      }),
    );

    await render(CategoryListComponent, {
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    });

    expect(screen.queryByText('Cat 1')).toBeTruthy();
    expect(screen.queryByText('Cat 2')).toBeTruthy();
  });

  it('renders empty-state when no categories exist', async () => {
    mockCategoryService.list.mockReturnValue(
      of({
        items: [],
        total: 0,
      }),
    );

    await render(CategoryListComponent, {
      providers: [
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    });

    expect(
      screen.queryByText(/Sin datos/i) || document.querySelector('.empty-state-container'),
    ).toBeTruthy();
  });
});
