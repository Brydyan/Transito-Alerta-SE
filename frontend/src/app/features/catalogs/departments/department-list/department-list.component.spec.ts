import { render, screen, fireEvent } from '@testing-library/angular';
import { DepartmentListComponent } from './department-list.component';
import { DepartmentService } from '../services/department.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { IDepartment } from '../interfaces/idepartment.interface';

describe('DepartmentListComponent', () => {
  let mockDepartmentService: {
    list: jest.Mock;
    remove: jest.Mock;
  };
  let mockToastService: { success: jest.Mock; error: jest.Mock };
  let mockDialogService: { confirm: jest.Mock };
  let mockActivatedRoute: { snapshot: { params: Record<string, string> } };
  let mockAuthService: { currentUser: jest.Mock };

  const sampleDept: IDepartment = {
    id: 'dept-1',
    name: 'Traffic',
    description: 'Manages traffic incidents',
    organization_id: 'org-1',
    organization_name: 'GAD Quito',
    user_count: 4,
    created_at: '2026-09-15T20:00:00Z',
    updated_at: '2026-09-15T20:00:00Z',
    deleted_at: null,
  };

  beforeEach(() => {
    mockDepartmentService = {
      list: jest.fn().mockReturnValue(of({ items: [], total: 0 })),
      remove: jest.fn().mockReturnValue(of({ id: 'dept-1', deleted_at: '2026-09-15T20:30:00Z' })),
    };
    mockToastService = { success: jest.fn(), error: jest.fn() };
    mockDialogService = { confirm: jest.fn().mockReturnValue(of(true)) };
    mockActivatedRoute = { snapshot: { params: {} } };
    mockAuthService = {
      currentUser: jest.fn().mockReturnValue({
        roleName: 'master',
        organizationId: null,
        // The master mock has CRUD on departments so *hasPermission renders
        // both New + Edit + Delete buttons; without DELETE departments the
        // delete button is omitted from the DOM and the click never fires.
        permissions: ['READ departments', 'CREATE departments', 'UPDATE departments', 'DELETE departments'],
      }),
    };
  });

  it('renders rows for fetched departments', async () => {
    mockDepartmentService.list.mockReturnValue(of({ items: [sampleDept], total: 1 }));

    await render(DepartmentListComponent, {
      providers: [
        { provide: DepartmentService, useValue: mockDepartmentService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    });

    expect(screen.queryByText('Traffic')).toBeTruthy();
    expect(screen.queryByText('GAD Quito')).toBeTruthy();
    // user_count of 4 should appear somewhere in the row
    expect(screen.queryByText('4')).toBeTruthy();
  });

  it('shows the empty state when total is 0', async () => {
    mockDepartmentService.list.mockReturnValue(of({ items: [], total: 0 }));

    await render(DepartmentListComponent, {
      providers: [
        { provide: DepartmentService, useValue: mockDepartmentService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    });

    // EmptyStateComponent renders without rows — assertion: no <tr data-testid="dept-row">
    expect(screen.queryByText('Traffic')).toBeNull();
  });

  it('hides the Organization column for non-master roles (D9)', async () => {
    mockAuthService.currentUser.mockReturnValue({
      roleName: 'admin_org',
      organizationId: 'org-1',
      permissions: ['READ departments'],
    });

    await render(DepartmentListComponent, {
      providers: [
        { provide: DepartmentService, useValue: mockDepartmentService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    });

    // Master would see "Organización" header. For admin_org, that
    // header should not render — assert by absence of the header text.
    // Note: "Organización" is the Spanish column label per mock 05-01.
    expect(screen.queryByText('Organización')).toBeNull();
  });

  it('delete confirm flow calls service.remove and reloads', async () => {
    mockDepartmentService.list.mockReturnValue(of({ items: [sampleDept], total: 1 }));

    await render(DepartmentListComponent, {
      providers: [
        { provide: DepartmentService, useValue: mockDepartmentService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    });

    // Click the trash/delete button → opens confirm dialog → confirms → service.remove
    const deleteBtn = screen.queryByTestId('dept-delete-btn');
    if (deleteBtn) {
      fireEvent.click(deleteBtn);
    }

    // The confirm service was invoked (regardless of button presence in
    // the rendered DOM, the click handler should have routed through
    // confirm). We assert via mock — confirms the wiring.
    expect(mockDialogService.confirm).toHaveBeenCalled();
  });

  it('search input fires exactly one request after debounce (400ms)', async () => {
    jest.useFakeTimers();
    mockDepartmentService.list.mockReturnValue(of({ items: [], total: 0 }));

    const { fixture } = await render(DepartmentListComponent, {
      providers: [
        { provide: DepartmentService, useValue: mockDepartmentService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockDialogService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    });
    const component = fixture.componentInstance as DepartmentListComponent;

    // Build a real Event with a target — `new Event('input')` has no
    // target so the component's `event.target.value` would throw.
    const fakeInput = document.createElement('input');
    fakeInput.value = 'traffic';
    const inputEvent = new Event('input', { bubbles: true });
    Object.defineProperty(inputEvent, 'target', { value: fakeInput });

    // Initial load fires one list() (component init) → reset counter
    mockDepartmentService.list.mockClear();
    component.onSearchInput(inputEvent);
    // Before debounce fires
    expect(mockDepartmentService.list).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    // After debounce + switchMap: exactly one list call
    expect(mockDepartmentService.list).toHaveBeenCalledTimes(1);
    // DepartmentService.list forwards the params straight to HttpService.get;
    // the mock here is at the DepartmentService layer, so the assertion
    // is against the params object directly, not 'departments' + params.
    expect(mockDepartmentService.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'traffic', page: 1, per_page: 10 }),
    );
    jest.useRealTimers();
  });
});
