import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatsCardsComponent } from './stats-cards.component';

describe('StatsCardsComponent (F6 rediseño)', () => {
  let fixture: ComponentFixture<StatsCardsComponent>;

  const fixtureStats = {
    totalPermissions: 124,
    protectedModules: 12,
    assignedUsers: 85,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsCardsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(StatsCardsComponent);
    fixture.componentRef.setInput('stats', fixtureStats);
    fixture.detectChanges();
  });

  it('renderiza las 3 tarjetas de stats', () => {
    const cards = fixture.nativeElement.querySelectorAll('.stat-card');
    expect(cards.length).toBe(3);
  });

  it('muestra los valores en el orden correcto (Permisos, Módulos, Usuarios)', () => {
    const values = fixture.nativeElement.querySelectorAll('.stat-value');
    expect(values.length).toBe(3);
    expect(values[0].textContent).toContain('124');
    expect(values[1].textContent).toContain('12');
    expect(values[2].textContent).toContain('85');
  });

  it('cada tarjeta tiene label descriptivo', () => {
    const labels = fixture.nativeElement.querySelectorAll('.stat-label');
    expect(labels[0].textContent).toContain('Total Permisos');
    expect(labels[1].textContent).toContain('Módulos Protegidos');
    expect(labels[2].textContent).toContain('Usuarios Asignados');
  });

  it('reacciona a cambios de input (datos actualizados)', () => {
    fixture.componentRef.setInput('stats', {
      totalPermissions: 200,
      protectedModules: 20,
      assignedUsers: 100,
    });
    fixture.detectChanges();
    const values = fixture.nativeElement.querySelectorAll('.stat-value');
    expect(values[0].textContent).toContain('200');
    expect(values[1].textContent).toContain('20');
    expect(values[2].textContent).toContain('100');
  });
});
