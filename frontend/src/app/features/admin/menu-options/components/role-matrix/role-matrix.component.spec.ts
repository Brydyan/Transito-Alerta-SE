import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoleMatrixComponent } from './role-matrix.component';
import { RoleMatrix } from '../../../../../core/services/menu-option.service';

describe('RoleMatrixComponent', () => {
  let component: RoleMatrixComponent;
  let fixture: ComponentFixture<RoleMatrixComponent>;

  const mockMatrix: RoleMatrix = {
    platform: [
      { role_id: 'r1', role_name: 'master', can_read: true, can_write: true },
      { role_id: 'r2', role_name: 'operador_sistema', can_read: true, can_write: false },
    ],
    organization: [
      { role_id: 'r3', role_name: 'admin_org', can_read: false, can_write: false },
      { role_id: 'r4', role_name: 'operador_org', can_read: true, can_write: false },
    ],
    public: [
      { role_id: 'r5', role_name: 'reporter', can_read: false, can_write: false },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoleMatrixComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RoleMatrixComponent);
    component = fixture.componentInstance;
  });

  // ── sc-334 admin-controles-enhancements Phase 4 (D2/R2) ────────────────

  describe('matrix input (nullable)', () => {
    it('returns empty roleGroups when matrix is null (parent not loaded yet)', () => {
      fixture.componentRef.setInput('matrix', null);
      fixture.detectChanges();
      expect(component.roleGroups()).toEqual([]);
    });

    it('exposes matrix as nullable (task 4.2)', () => {
      fixture.componentRef.setInput('matrix', null);
      expect(component.matrix()).toBeNull();
    });
  });

  describe('roleGroups computed (task 4.3)', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('matrix', mockMatrix);
      fixture.detectChanges();
    });

    it('renders three scope blocks: platform, organization, public', () => {
      const groups = component.roleGroups();
      expect(groups.length).toBe(3);
      expect(groups.map((g) => g.scope)).toEqual(['platform', 'organization', 'public']);
    });

    it('uses Spanish display labels per the F2.3 mock', () => {
      const groups = component.roleGroups();
      expect(groups[0].label).toBe('Plataforma');
      expect(groups[1].label).toBe('Organización');
      expect(groups[2].label).toBe('Público');
    });

    it('groups the right roles per scope — 2 platform, 2 organization, 1 public', () => {
      const groups = component.roleGroups();
      expect(groups[0].roles.length).toBe(2);
      expect(groups[1].roles.length).toBe(2);
      expect(groups[2].roles.length).toBe(1);
    });
  });

  describe('Read→Write invariant (R7, task 4.6)', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('matrix', mockMatrix);
      fixture.detectChanges();
    });

    it('emits accessChange with canWrite=false when canRead is turned off', () => {
      let emitted: { role_id: string; can_read: boolean; can_write: boolean } | null = null;
      component.accessChanged.subscribe((e) => (emitted = e));

      // r1: can_read=true, can_write=true. Toggling can_read to false must
      // force can_write to false too.
      component.toggleAccess('r1', 'can_read', false);
      expect(emitted).toEqual({ role_id: 'r1', can_read: false, can_write: false });
    });

    it('blocks setting canWrite=true when canRead=false (R7)', () => {
      let emitted: { role_id: string; can_read: boolean; can_write: boolean } | null = null;
      component.accessChanged.subscribe((e) => (emitted = e));

      // admin_org (r3): can_read=false, can_write=false. Trying to set
      // can_write=true without can_read must be blocked.
      component.toggleAccess('r3', 'can_write', true);
      expect(emitted).toBeNull();
    });

    it('allows setting canWrite=true when canRead=true', () => {
      let emitted: { role_id: string; can_read: boolean; can_write: boolean } | null = null;
      component.accessChanged.subscribe((e) => (emitted = e));

      // operador_org (r4): can_read=true, can_write=false → can set can_write=true.
      component.toggleAccess('r4', 'can_write', true);
      expect(emitted).toEqual({ role_id: 'r4', can_read: true, can_write: true });
    });

    it('emits accessChanged with snake_case wire (fix for NG0955)', () => {
      let fired = false;
      component.accessChanged.subscribe(() => (fired = true));
      component.toggleAccess('r1', 'can_read', false);
      expect(fired).toBe(true);
    });
  });

  describe('saving state', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('matrix', mockMatrix);
      fixture.detectChanges();
    });

    it('disables all checkboxes when saving is true', () => {
      fixture.componentRef.setInput('saving', true);
      fixture.detectChanges();
      expect(component.isDisabled()).toBe(true);
    });
  });
});
