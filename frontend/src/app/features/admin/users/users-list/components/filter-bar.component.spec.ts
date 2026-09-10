import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FilterBarComponent } from './filter-bar.component';
import { Organization, Role } from '../../models/user.interface';

describe('FilterBarComponent (F6 rediseño)', () => {
  let fixture: ComponentFixture<FilterBarComponent>;
  let component: FilterBarComponent;

  const roles: Role[] = [
    { rolId: 'role-1', nombre: 'ADMIN ORG' },
    { rolId: 'role-2', nombre: 'OPERADOR ORG' },
  ];
  const orgs: Organization[] = [
    { id: 'org-1', nombre: 'GAD Guayaquil' },
    { id: 'org-2', nombre: 'GAD Santa Elena' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilterBarComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(FilterBarComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('roles', roles);
    fixture.componentRef.setInput('organizations', orgs);
    fixture.detectChanges();
  });

  it('renderiza la opción "Todos" para ambos dropdowns', () => {
    const selects = fixture.nativeElement.querySelectorAll('select');
    expect(selects.length).toBe(2);
    const firstOptions = selects[0].querySelectorAll('option');
    expect(firstOptions[0].textContent).toContain('Todos los roles');
    const secondOptions = selects[1].querySelectorAll('option');
    expect(secondOptions[0].textContent).toContain('Todas las organizaciones');
  });

  it('emite filterChange al cambiar el rol, conservando org', () => {
    const emitted: { role: string; org: string }[] = [];
    component.filterChange.subscribe((v) => emitted.push(v));
    component.onRoleChange('1');
    expect(emitted).toEqual([{ role: '1', org: '' }]);
  });

  it('emite filterChange al cambiar la organización, conservando rol', () => {
    const emitted: { role: string; org: string }[] = [];
    component.filterChange.subscribe((v) => emitted.push(v));
    component.onOrgChange('org-2');
    expect(emitted).toEqual([{ role: '', org: 'org-2' }]);
  });

  it('reset emite ambos filtros en vacío', () => {
    const emitted: { role: string; org: string }[] = [];
    component.filterChange.subscribe((v) => emitted.push(v));
    component.reset();
    expect(emitted).toEqual([{ role: '', org: '' }]);
  });

  it('muestra el botón Limpiar cuando hay algún filtro activo', () => {
    fixture.componentRef.setInput('roleControl', '1');
    fixture.detectChanges();
    const resetBtn = fixture.nativeElement.querySelector('.reset-btn');
    expect(resetBtn).toBeTruthy();
  });

  it('oculta el botón Limpiar cuando no hay filtros', () => {
    const resetBtn = fixture.nativeElement.querySelector('.reset-btn');
    expect(resetBtn).toBeNull();
  });
});
