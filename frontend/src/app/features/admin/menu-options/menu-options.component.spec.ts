import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { MenuOptionsComponent } from './menu-options.component';
import { MenuOptionService } from '../../../core/services/menu-option.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';

describe('MenuOptionsComponent', () => {
  let component: MenuOptionsComponent;
  let fixture: ComponentFixture<MenuOptionsComponent>;
  let mockService: jest.Mocked<Partial<MenuOptionService>>;
  let mockConfirmDialog: jest.Mocked<Partial<ConfirmDialogService>>;
  let confirmSubject: Subject<boolean>;

  const sampleOption = {
    id: 'opt-1',
    name: 'Reportes',
    route: '/reports',
    icon: 'file-text',
    display_order: 30,
    is_active: true,
    parent_id: null,
    created_at: '2026-09-01',
  };

  beforeEach(async () => {
    confirmSubject = new Subject<boolean>();

    mockService = {
      findAll: jest.fn().mockReturnValue({
        pipe: () => ({ subscribe: () => {} }),
      } as never),
      getEndpointCatalog: jest.fn().mockReturnValue({
        pipe: () => ({ subscribe: () => {} }),
      } as never),
      findOne: jest.fn().mockReturnValue({
        pipe: () => ({ subscribe: () => {} }),
      } as never),
      getRoleMatrix: jest.fn().mockReturnValue({
        pipe: () => ({ subscribe: () => {} }),
      } as never),
      getAssignedEndpoints: jest.fn().mockReturnValue({
        pipe: () => ({ subscribe: () => {} }),
      } as never),
      assignEndpoints: jest.fn().mockReturnValue({
        pipe: () => ({ subscribe: () => {} }),
      } as never),
      setRoleAccess: jest.fn().mockReturnValue({
        pipe: () => ({ subscribe: () => {} }),
      } as never),
      create: jest.fn().mockReturnValue({ pipe: () => ({ subscribe: () => {} }) } as never),
      update: jest.fn().mockReturnValue({ pipe: () => ({ subscribe: () => {} }) } as never),
      delete: jest.fn().mockReturnValue({ pipe: () => ({ subscribe: () => {} }) } as never),
    };

    mockConfirmDialog = {
      activeDialog: undefined,
      confirm: jest.fn().mockReturnValue(confirmSubject),
      approve: jest.fn(),
      reject: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, MenuOptionsComponent],
      providers: [
        { provide: MenuOptionService, useValue: mockService },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuOptionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ── Original sanity tests ───────────────────────────────────────────────

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('has no option selected initially', () => {
    expect(component.selectedOptionId()).toBeNull();
  });

  it('selects an option when tree emits selection', () => {
    component.onTreeSelect('a1');
    expect(component.selectedOptionId()).toBe('a1');
  });

  it('clears selection when "back" is triggered', () => {
    component.onTreeSelect('a1');
    expect(component.selectedOptionId()).toBe('a1');
    component.onBackToList();
    expect(component.selectedOptionId()).toBeNull();
  });

  it('sets form mode to create when tree emits create request', () => {
    component.onTreeCreate('parent-1');
    expect(component.isCreating()).toBe(true);
    expect(component.formParentId()).toBe('parent-1');
  });

  it('sets form mode to create at root when parentId is null', () => {
    component.onTreeCreate(null);
    expect(component.isCreating()).toBe(true);
    expect(component.formParentId()).toBeNull();
  });

  // ── sc-334 admin-controles-enhancements Phase 5 (D5/D7/R1/R5) ──────────

  describe('delete confirmation (D5/R5)', () => {
    beforeEach(() => {
      // populate allOptions so the lookup succeeds
      (component as unknown as { allOptions: { set: (v: unknown[]) => void } }).allOptions.set([sampleOption]);
      component.onTreeSelect(sampleOption.id);
    });

    it('opens a ConfirmDialog with the option name before deleting', () => {
      component.deleteOption();
      expect(mockConfirmDialog.confirm).toHaveBeenCalledTimes(1);
      const config = (mockConfirmDialog.confirm as jest.Mock).mock.calls[0][0];
      expect(config.title).toBe('Eliminar opción de menú');
      expect(config.message).toContain('Reportes');
      expect(config.confirmText).toBe('Eliminar');
      expect(config.cancelText).toBe('Cancelar');
      expect(config.isDanger).toBe(true);
    });

    it('does NOT call the delete service when the user cancels', () => {
      component.deleteOption();
      confirmSubject.next(false);
      confirmSubject.complete();
      expect(mockService.delete).not.toHaveBeenCalled();
    });

    it('calls the delete service when the user confirms', () => {
      component.deleteOption();
      confirmSubject.next(true);
      confirmSubject.complete();
      expect(mockService.delete).toHaveBeenCalledWith(sampleOption.id);
    });

    it('does nothing when no option is selected', () => {
      component.onBackToList();
      component.deleteOption();
      expect(mockConfirmDialog.confirm).not.toHaveBeenCalled();
    });
  });

  describe('loadAssignedEndpoints (D7/R1)', () => {
    it('is called from loadOptionDetail via onTreeSelect (no longer a no-op stub)', () => {
      // findOne is called synchronously by loadOptionDetail
      mockService.findOne = jest.fn().mockReturnValue({
        pipe: () => ({
          subscribe: ({ next }: { next: (v: typeof sampleOption) => void }) =>
            next(sampleOption),
        }),
      } as never);

      component.onTreeSelect(sampleOption.id);

      expect(mockService.findOne).toHaveBeenCalledWith(sampleOption.id);
      // getAssignedEndpoints is also called as part of loadOptionDetail
      expect(mockService.getAssignedEndpoints).toHaveBeenCalledWith(sampleOption.id);
    });
  });

  // ── sc-334 admin-controles-enhancements Phase 6 (D4/R4) ──────────────

  describe('nextOrder suggestion (D4/R4)', () => {
    function setOptions(opts: typeof sampleOption[]): void {
      (
        component as unknown as { allOptions: { set: (v: unknown[]) => void } }
      ).allOptions.set(opts);
    }

    function setEditingParentId(id: string | null): void {
      (
        component as unknown as { editingParentId: { set: (v: string | null) => void } }
      ).editingParentId.set(id);
    }

    it('suggests 10 for the first root-level menu (parent_id=null, empty)', () => {
      setOptions([]);
      setEditingParentId(null);
      expect(component.nextOrder()).toBe(10);
    });

    it('suggests max+10 for root-level when siblings exist (10, 20, 30 → 40)', () => {
      setOptions([
        { ...sampleOption, id: 'r1', parent_id: null, display_order: 10 },
        { ...sampleOption, id: 'r2', parent_id: null, display_order: 20 },
        { ...sampleOption, id: 'r3', parent_id: null, display_order: 30 },
      ]);
      setEditingParentId(null);
      expect(component.nextOrder()).toBe(40);
    });

    it('suggests max+1 for sub-menu under parent (1, 2 → 3)', () => {
      setOptions([
        { ...sampleOption, id: 'p1', parent_id: null, display_order: 10 },
        { ...sampleOption, id: 'c1', parent_id: 'p1', display_order: 1 } as unknown as typeof sampleOption,
        { ...sampleOption, id: 'c2', parent_id: 'p1', display_order: 2 } as unknown as typeof sampleOption,
      ]);
      setEditingParentId('p1');
      expect(component.nextOrder()).toBe(3);
    });

    it('suggests 1 for the first child of a parent (no siblings yet)', () => {
      setOptions([{ ...sampleOption, id: 'p1', parent_id: null, display_order: 10 }]);
      setEditingParentId('p1');
      expect(component.nextOrder()).toBe(1);
    });
  });
});
