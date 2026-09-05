import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { OrganizationListComponent } from './organization-list.component';
import { OrganizationService } from '../services/organization.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';

describe('OrganizationListComponent', () => {
  let mockOrganizationService: any;
  let mockToastService: any;
  let mockDialogService: any;
  let mockActivatedRoute: any;

  beforeEach(() => {
    mockOrganizationService = {
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

  it('renders rows for fetched organizations', async () => {
    mockOrganizationService.list.mockReturnValue(
      of({
        items: [
          {
            id: '1',
            name: 'Org 1',
            max_active_claims: 1,
            created_at: '',
            updated_at: '',
            zone_id: null,
            parent_id: null,
            incident_category_id: null,
          },
          {
            id: '2',
            name: 'Org 2',
            max_active_claims: 5,
            created_at: '',
            updated_at: '',
            zone_id: null,
            parent_id: null,
            incident_category_id: null,
          },
        ],
        total: 2,
      }),
    );

    await render(OrganizationListComponent, {
      providers: [
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    });

    expect(screen.queryByText('Org 1')).toBeTruthy();
    expect(screen.queryByText('Org 2')).toBeTruthy();
  });

  it('renders empty-state when no organizations exist', async () => {
    mockOrganizationService.list.mockReturnValue(
      of({
        items: [],
        total: 0,
      }),
    );

    await render(OrganizationListComponent, {
      providers: [
        { provide: OrganizationService, useValue: mockOrganizationService },
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
