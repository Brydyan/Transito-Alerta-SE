import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WeeklyPerformanceChartComponent } from './weekly-performance-chart.component';
import { WeeklyDayPoint } from '../../../core/models/dashboard.model';

describe('WeeklyPerformanceChartComponent (F6 redesign)', () => {
  let fixture: ComponentFixture<WeeklyPerformanceChartComponent>;

  const fixtureData: WeeklyDayPoint[] = [
    { date: '2026-09-02', label: 'Mié', recibidas: 4, resueltas: 2 },
    { date: '2026-09-03', label: 'Jue', recibidas: 6, resueltas: 3 },
    { date: '2026-09-04', label: 'Vie', recibidas: 3, resueltas: 1 },
    { date: '2026-09-05', label: 'Sáb', recibidas: 2, resueltas: 2 },
    { date: '2026-09-06', label: 'Dom', recibidas: 1, resueltas: 0 },
    { date: '2026-09-07', label: 'Lun', recibidas: 5, resueltas: 4 },
    { date: '2026-09-08', label: 'Mar', recibidas: 7, resueltas: 5 },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WeeklyPerformanceChartComponent],
    }).compileComponents();
  });

  function render(data: ReadonlyArray<WeeklyDayPoint>) {
    fixture = TestBed.createComponent(WeeklyPerformanceChartComponent);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
  }

  it('renderiza una columna por día con sus dos barras', () => {
    render(fixtureData);
    const days = fixture.nativeElement.querySelectorAll('.day-col');
    expect(days.length).toBe(7);
  });

  it('estado vacío cuando data = []', () => {
    render([]);
    expect(fixture.nativeElement.querySelector('.empty-state')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.day-col').length).toBe(0);
  });

  it('yMax por defecto de 8: una serie de 6 = 75%', () => {
    render(fixtureData);
    const component = fixture.componentInstance;
    // El máximo interno es 8 (yMax), no el peak real de los datos.
    // 6 / 8 = 75%.
    expect(component.heightPct(6)).toBe(75);
  });

  it('altura mínima de 2% para no perder la barra cuando es 0', () => {
    render(fixtureData);
    const component = fixture.componentInstance;
    // 0 sobre max 8 = 0% → piso 2%.
    expect(component.heightPct(0)).toBe(2);
  });
});
