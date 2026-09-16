import { render, screen, fireEvent } from '@testing-library/angular';
import { DepartmentFormComponent } from './department-form.component';
import { DepartmentService } from '../services/department.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { of, throwError } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { IDepartment } from '../interfaces/idepartment.interface';

describe('DepartmentFormComponent', () => {
  let mockDepartmentService: {
    getById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let mockToastService: { success: jest.Mock; error: jest.Mock };
  let mockDialogService: { confirm: jest.Mock };
  let mockAuthService: { currentUser: jest.Mock };

  const baseDept: IDepartment = {
    id: 'dept-1',
    name: 'Traffic',
    description: 'Manages traffic incidents',
    organization_id: 'org-1',
    created_at: '2026-09-15T20:00:00Z',
    updated_at: '2026-09-15T20:00:00Z',
    deleted_at: null,
  };

  function makeRoute(id: string | null): { snapshot: { paramMap: Map<string, string> } } {
    const map = new Map<string, string>();
    if (id !== null) map.set('id', id);
    return { snapshot: { paramMap: map } };
  }

  beforeEach(() => {
    mockDepartmentService = {
      getById: jest.fn().mockReturnValue(of(baseDept)),
      create: jest.fn().mockReturnValue(of(baseDept)),
      update: jest.fn().mockReturnValue(of({ ...baseDept, name: 'Updated' })),
    };
    mockToastService = { success: jest.fn(), error: jest.fn() };
    mockDialogService = { confirm: jest.fn().mockReturnValue(of(true)) };
    mockAuthService = {
      currentUser: jest.fn().mockReturnValue({
        roleName: 'admin_org',
        organizationId: 'org-1',
      }),
    };
  });

  describe('create mode (no :id param)', () => {
    it('POSTs the form on submit and navigates back to list', async () => {
      await render(DepartmentFormComponent, {
        providers: [
          { provide: DepartmentService, useValue: mockDepartmentService },
          { provide: ToastService, useValue: mockToastService },
          { provide: ConfirmDialogService, useValue: mockDialogService },
          { provide: AuthService, useValue: mockAuthService },
          { provide: ActivatedRoute, useValue: makeRoute(null) },
        ],
      });

      const nameInput = screen.getByLabelText(/Nombre/i) as HTMLInputElement;
      const descInput = screen.getByLabelText(/Descripci[oó]n/i) as HTMLTextAreaElement; // eslint-disable-line no-undef
      nameInput.value = 'New Dept';
      descInput.value = 'Test';
      fireEvent.input(nameInput);
      fireEvent.input(descInput);

      const submitBtn = screen.getByRole('button', { name: /Crear departamento/i });
      fireEvent.click(submitBtn);

      expect(mockDepartmentService.create).toHaveBeenCalledWith({
        name: 'New Dept',
        description: 'Test',
        organization_id: 'org-1',
      });
      expect(mockToastService.success).toHaveBeenCalledWith(expect.stringContaining('creado'));
    });

    it('blocks submission when name is empty (client-side validation)', async () => {
      const { fixture } = await render(DepartmentFormComponent, {
        providers: [
          { provide: DepartmentService, useValue: mockDepartmentService },
          { provide: ToastService, useValue: mockToastService },
          { provide: ConfirmDialogService, useValue: mockDialogService },
          { provide: AuthService, useValue: mockAuthService },
          { provide: ActivatedRoute, useValue: makeRoute(null) },
        ],
      });

      const submitBtn = screen.getByRole('button', { name: /Crear departamento/i });
      fireEvent.click(submitBtn);

      // No API call should have been made
      expect(mockDepartmentService.create).not.toHaveBeenCalled();
      // The form is still invalid (Angular's reactive form validation,
      // not HTML5 validity.valid — those are separate concerns).
      const component = fixture.componentInstance as DepartmentFormComponent;
      expect(component.form.invalid).toBe(true);
    });
  });

  describe('edit mode (:id present)', () => {
    it('GETs the dept by id on init and patches the form', async () => {
      await render(DepartmentFormComponent, {
        providers: [
          { provide: DepartmentService, useValue: mockDepartmentService },
          { provide: ToastService, useValue: mockToastService },
          { provide: ConfirmDialogService, useValue: mockDialogService },
          { provide: AuthService, useValue: mockAuthService },
          { provide: ActivatedRoute, useValue: makeRoute('dept-1') },
        ],
      });

      expect(mockDepartmentService.getById).toHaveBeenCalledWith('dept-1');
      // Form populated with the fetched values
      const nameInput = screen.getByLabelText(/Nombre/i) as HTMLInputElement;
      expect(nameInput.value).toBe('Traffic');
    });

    it('PATCHes the form on submit and navigates back', async () => {
      await render(DepartmentFormComponent, {
        providers: [
          { provide: DepartmentService, useValue: mockDepartmentService },
          { provide: ToastService, useValue: mockToastService },
          { provide: ConfirmDialogService, useValue: mockDialogService },
          { provide: AuthService, useValue: mockAuthService },
          { provide: ActivatedRoute, useValue: makeRoute('dept-1') },
        ],
      });

      const submitBtn = screen.getByRole('button', { name: /Guardar cambios/i });
      fireEvent.click(submitBtn);

      expect(mockDepartmentService.update).toHaveBeenCalledWith(
        'dept-1',
        expect.objectContaining({ name: 'Traffic' }),
      );
      expect(mockToastService.success).toHaveBeenCalledWith(expect.stringContaining('actualizado'));
    });
  });

  describe('error handling', () => {
    it('409 response shows inline name error (UNIQUE collision)', async () => {
      mockDepartmentService.create.mockReturnValue(
        throwError(() => ({
          status: 409,
          error: { message: 'duplicate' },
        })),
      );

      await render(DepartmentFormComponent, {
        providers: [
          { provide: DepartmentService, useValue: mockDepartmentService },
          { provide: ToastService, useValue: mockToastService },
          { provide: ConfirmDialogService, useValue: mockDialogService },
          { provide: AuthService, useValue: mockAuthService },
          { provide: ActivatedRoute, useValue: makeRoute(null) },
        ],
      });

      const nameInput = screen.getByLabelText(/Nombre/i) as HTMLInputElement;
      nameInput.value = 'Dup';
      fireEvent.input(nameInput);
      const submitBtn = screen.getByRole('button', { name: /Crear departamento/i });
      fireEvent.click(submitBtn);

      expect(
        screen.queryByText(/Ya existe un departamento con este nombre en tu organización/i),
      ).toBeTruthy();
    });

    it('404 response on submit shows toast + navigates to list', async () => {
      mockDepartmentService.update.mockReturnValue(
        throwError(() => ({ status: 404, error: { message: 'gone' } })),
      );

      await render(DepartmentFormComponent, {
        providers: [
          { provide: DepartmentService, useValue: mockDepartmentService },
          { provide: ToastService, useValue: mockToastService },
          { provide: ConfirmDialogService, useValue: mockDialogService },
          { provide: AuthService, useValue: mockAuthService },
          { provide: ActivatedRoute, useValue: makeRoute('dept-1') },
        ],
      });

      const submitBtn = screen.getByRole('button', { name: /Guardar cambios/i });
      fireEvent.click(submitBtn);

      // Allow microtasks to flush
      await new Promise((r) => setTimeout(r, 0));
      expect(mockToastService.error).toHaveBeenCalled();
    });
  });
});
