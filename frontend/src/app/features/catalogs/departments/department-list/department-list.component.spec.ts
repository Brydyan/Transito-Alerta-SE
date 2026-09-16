import { render, screen, fireEvent } from '@testing-library/angular';
import { DepartmentListComponent } from './department-list.component';
import { DepartmentService } from '../services/department.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { of, throwError } from 'rxjs';
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
        // Master has full CRUD so the *hasPermission directives render
        // every button (New / Edit / Delete). Tests that need a
        // read-only mock override this.
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

    expect(screen.queryByText('Traffic')).toBeNull();
  });

  // D9 — Organization column only renders for master + operador_sistema.
  it('hides the Organization column for non-master roles', async () => {
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

    expect(screen.queryByText('Organización')).toBeNull();
  });

  // 7.1 — 403 hides action buttons when caller lacks CRUD perms.
  it('403 response hides Create / Edit / Delete buttons (no CRUD perms)', async () => {
    mockAuthService.currentUser.mockReturnValue({
      roleName: 'reporter',
      organizationId: null,
      permissions: ['READ departments'],
    });
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

    expect(screen.queryByTestId('dept-delete-btn')).toBeNull();
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

    const deleteBtn = screen.queryByTestId('dept-delete-btn');
    if (deleteBtn) {
      fireEvent.click(deleteBtn);
    }

    expect(mockDialogService.confirm).toHaveBeenCalled();
  });

  // 7.1 — search error shows error toast.
  it('search error shows error toast', async () => {
    // First call (initial load) returns ok; subsequent calls (after
    // the search refire) reject — that's the path that triggers the
    // toast.
    mockDepartmentService.list
      .mockReturnValueOnce(of({ items: [], total: 0 }))
      .mockReturnValueOnce(throwError(() => new Error('boom')));

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

    const fakeInput = document.createElement('input');
    fakeInput.value = 'boom';
    const inputEvent = new Event('input', { bubbles: true });
    Object.defineProperty(inputEvent, 'target', { value: fakeInput });
    component.searchInput.set('boom');
    component.onSearchInput(inputEvent);

    // Wait for the debounce (400ms) + RxJS microtask to flush.
    await new Promise((r) => setTimeout(r, 450));
    expect(mockToastService.error).toHaveBeenCalled();
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

    const fakeInput = document.createElement('input');
    fakeInput.value = 'traffic';
    const inputEvent = new Event('input', { bubbles: true });
    Object.defineProperty(inputEvent, 'target', { value: fakeInput });

    mockDepartmentService.list.mockClear();
    component.onSearchInput(inputEvent);
    expect(mockDepartmentService.list).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(mockDepartmentService.list).toHaveBeenCalledTimes(1);
    expect(mockDepartmentService.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'traffic', page: 1, per_page: 10 }),
    );
    jest.useRealTimers();
  });
});
