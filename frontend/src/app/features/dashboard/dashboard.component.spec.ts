import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';

import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    const mockAuthService = {
      logout: jest.fn(),
      currentUser: signal({ name: 'Test User', roleName: 'Admin' }),
    };

    // F6 (`2026-09-08-f6-dashboard-redesign`): el componente ahora
    // inyecta `DashboardService` además de `AuthService`. La
    // aserción `expect(component).toBeTruthy()` sigue intacta (D1
    // del F6 redesign) — sólo se amplía el `providers` del
    // TestBed para que el inyector resuelva.
    const mockDashboardService = {
      getStats: () => of(null),
      getWeeklyStats: () => of({ days: [] }),
      getRecentActivity: () => of([]),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
