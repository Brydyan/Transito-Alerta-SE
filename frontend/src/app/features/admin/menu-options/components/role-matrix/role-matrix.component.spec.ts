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
    fixture.componentRef.setInput('matrix', mockMatrix);
    fixture.componentRef.setInput('saving', false);
    fixture.detectChanges();
  });

  it('renders three scope blocks: platform, organization, public', () => {
    const blocks = component.scopeBlocks();
    expect(blocks.length).toBe(3);
    expect(blocks.map((b) => b.key)).toEqual(['platform', 'organization', 'public']);
  });

  it('renders correct labels for scope blocks', () => {
    const blocks = component.scopeBlocks();
    expect(blocks[0].label).toBe('Plataforma');
    expect(blocks[1].label).toBe('Organización');
    expect(blocks[2].label).toBe('Público');
  });

  it('renders roles within each block', () => {
    const blocks = component.scopeBlocks();
    expect(blocks[0].entries.length).toBe(2);
    expect(blocks[1].entries.length).toBe(2);
    expect(blocks[2].entries.length).toBe(1);
  });

  it('emits accessChange when a checkbox is toggled', () => {
    let emitted: { roleId: string; canRead: boolean; canWrite: boolean } | null = null;
    component.accessChange.subscribe((e) => (emitted = e));

    // r1 has canRead=true, canWrite=true
    // Toggling canRead to false should also force canWrite to false
    component.toggleAccess('r1', 'canRead', false);
    expect(emitted).toEqual({ roleId: 'r1', canRead: false, canWrite: false });
  });

  it('prevents setting canWrite=true when canRead=false', () => {
    let emitted: { roleId: string; canRead: boolean; canWrite: boolean } | null = null;
    component.accessChange.subscribe((e) => (emitted = e));

    // admin_org has canRead=false, canWrite=false
    // Trying to set canWrite=true without canRead should be blocked
    component.toggleAccess('r3', 'canWrite', true);
    expect(emitted).toBeNull();
  });

  it('allows setting canWrite=true when canRead=true', () => {
    let emitted: { roleId: string; canRead: boolean; canWrite: boolean } | null = null;
    component.accessChange.subscribe((e) => (emitted = e));

    // operador_org has canRead=true, canWrite=false
    component.toggleAccess('r4', 'canWrite', true);
    expect(emitted).toEqual({ roleId: 'r4', canRead: true, canWrite: true });
  });

  it('disables checkboxes when saving is true', () => {
    fixture.componentRef.setInput('saving', true);
    fixture.detectChanges();
    expect(component.isDisabled()).toBe(true);
  });
});
