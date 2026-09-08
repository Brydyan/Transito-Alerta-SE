import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TopCategoriesChartComponent } from './top-categories-chart.component';
import { TopCategory } from '../../../core/models/dashboard.model';

describe('TopCategoriesChartComponent (F6 redesign)', () => {
  let fixture: ComponentFixture<TopCategoriesChartComponent>;

  const fixtureData: TopCategory[] = [
    { name: 'Baches', total: 8, resolved: 3, pending: 5 },
    { name: 'Agua', total: 6, resolved: 2, pending: 4 },
    { name: 'Alumbrado', total: 4, resolved: 1, pending: 3 },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopCategoriesChartComponent],
    }).compileComponents();
  });

  function render(data: ReadonlyArray<TopCategory>) {
    fixture = TestBed.createComponent(TopCategoriesChartComponent);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
  }

  it('renderiza una fila por categoría (ordenada por total)', () => {
    render(fixtureData);
    const rows = fixture.nativeElement.querySelectorAll('.bar-row');
    expect(rows.length).toBe(3);
    // El primero es el de mayor total.
    expect(rows[0].querySelector('.bar-label')?.textContent).toContain('Baches');
  });

  it('resetea el ancho de barra al máximo (la mayor = 100%)', () => {
    render(fixtureData);
    const component = fixture.componentInstance;
    // Baches (8) es el máximo — 100%.
    expect(component.widthPct(8)).toBe(100);
    // Alumbrado (4) es la mitad — ~50% (con piso de 2%).
    expect(component.widthPct(4)).toBeGreaterThanOrEqual(40);
  });

  it('estado vacío cuando data = []', () => {
    render([]);
    const empty = fixture.nativeElement.querySelector('.empty-state');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('No hay datos');
    expect(fixture.nativeElement.querySelectorAll('.bar-row').length).toBe(0);
  });

  it('respeta maxItems: trunca después de N', () => {
    render(fixtureData);
    fixture.componentRef.setInput('maxItems', 2);
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('.bar-row');
    expect(rows.length).toBe(2);
    // El ranking ordena por total descendente: Baches (8) y Agua (6).
    expect(rows[0].querySelector('.bar-label')?.textContent).toContain('Baches');
    expect(rows[1].querySelector('.bar-label')?.textContent).toContain('Agua');
  });
});
