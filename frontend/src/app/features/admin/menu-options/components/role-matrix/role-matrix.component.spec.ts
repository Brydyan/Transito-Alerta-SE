import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoleMatrixComponent } from './role-matrix.component';
import { RoleMatrix } from '../../../../../core/services/menu-option.service';

describe('RoleMatrixComponent', () => {
  let component: RoleMatrixComponent;
  let fixture: ComponentFixture<RoleMatrixComponent>;

  const mockMatrix: RoleMatrix = {
    platform: [
      { roleId: 'r1', roleName: 'master', canRead: true, canWrite: true },
      { roleId: 'r2', roleName: 'operador_sistema', canRead: true, canWrite: false },
    ],
    organization: [
      { roleId: 'r3', roleName: 'admin_org', canRead: false, canWrite: false },
      { roleId: 'r4', roleName: 'operador_org', canRead: true, canWrite: false },
    ],
    public: [
      { roleId: 'r5', roleName: 'reporter', canRead: false, canWrite: false },
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
      let emitted: { roleId: string; canRead: boolean; canWrite: boolean } | null = null;
      component.accessChanged.subscribe((e) => (emitted = e));

      // r1: canRead=true, canWrite=true. Toggling canRead to false must
      // force canWrite to false too.
      component.toggleAccess('r1', 'canRead', false);
      expect(emitted).toEqual({ roleId: 'r1', canRead: false, canWrite: false });
    });

    it('blocks setting canWrite=true when canRead=false (R7)', () => {
      let emitted: { roleId: string; canRead: boolean; canWrite: boolean } | null = null;
      component.accessChanged.subscribe((e) => (emitted = e));

      // admin_org (r3): canRead=false, canWrite=false. Trying to set
      // canWrite=true without canRead must be blocked.
      component.toggleAccess('r3', 'canWrite', true);
      expect(emitted).toBeNull();
    });

    it('allows setting canWrite=true when canRead=true', () => {
      let emitted: { roleId: string; canRead: boolean; canWrite: boolean } | null = null;
      component.accessChanged.subscribe((e) => (emitted = e));

      // operador_org (r4): canRead=true, canWrite=false → can set canWrite=true.
      component.toggleAccess('r4', 'canWrite', true);
      expect(emitted).toEqual({ roleId: 'r4', canRead: true, canWrite: true });
    });

    it('emits accessChanged as the renamed output (task 4.2)', () => {
      // Output is now `accessChanged` (was `accessChange`).
      let fired = false;
      component.accessChanged.subscribe(() => (fired = true));
      component.toggleAccess('r1', 'canRead', false);
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
