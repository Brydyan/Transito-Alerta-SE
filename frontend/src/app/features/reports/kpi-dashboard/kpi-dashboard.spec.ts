import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KpiDashboardComponent } from './kpi-dashboard';

describe('KpiDashboardComponent', () => {
  let component: KpiDashboardComponent;
  let fixture: ComponentFixture<KpiDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KpiDashboardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(KpiDashboardComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
