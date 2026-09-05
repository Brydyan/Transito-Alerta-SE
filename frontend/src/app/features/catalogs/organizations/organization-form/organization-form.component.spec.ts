import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { OrganizationFormComponent } from './organization-form.component';
import { OrganizationService } from '../services/organization.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { GeoZoneService } from '../../locations/services/geo-zone.service';
import { IncidentCategoryService } from '../../incident-categories/services/incident-category.service';

describe('OrganizationFormComponent', () => {
  let mockOrganizationService: any;
  let mockZoneService: any;
  let mockCategoryService: any;
  let mockToastService: any;
  let mockDialogService: any;
  let mockActivatedRoute: any;
  let mockRouter: any;

  beforeEach(() => {
    mockOrganizationService = {
      create: jest.fn().mockReturnValue(of({ id: '1', name: 'Org 1' })),
      getById: jest.fn().mockReturnValue(of({ id: '1', name: 'Org 1' })),
      update: jest.fn().mockReturnValue(of({ id: '1', name: 'Org 1' })),
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
    };
    mockZoneService = {
      listAll: jest.fn().mockReturnValue(of([])),
    };
    mockCategoryService = {
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
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
    const { fixture } = await render(OrganizationFormComponent, {
      imports: [ReactiveFormsModule],
      providers: [
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: GeoZoneService, useValue: mockZoneService },
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const form = fixture.componentInstance;
    form.onSubmit();

    expect(mockOrganizationService.create).not.toHaveBeenCalled();
    expect(form.form.invalid).toBe(true);
  });

  it('displays 422 server error mapped to a field', async () => {
    mockOrganizationService.create.mockReturnValue(
      throwError(() => ({
        status: 422,
        error: { errors: { name: 'Name must be unique' } },
      })),
    );

    const { fixture } = await render(OrganizationFormComponent, {
      imports: [ReactiveFormsModule],
      providers: [
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: GeoZoneService, useValue: mockZoneService },
        { provide: IncidentCategoryService, useValue: mockCategoryService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const form = fixture.componentInstance;
    form.form.patchValue({ name: 'Duplicate', max_active_claims: 1 });
    form.onSubmit();

    fixture.detectChanges();

    expect(form.serverErrors()['name']).toBe('Name must be unique');
    const errorMessage = screen.queryByText('Name must be unique');
    expect(errorMessage).toBeTruthy();
  });
});
