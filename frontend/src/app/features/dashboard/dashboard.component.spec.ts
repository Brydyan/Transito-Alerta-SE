import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';

import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let mockDashboardService: {
    getStats: jest.Mock;
    getWeeklyStats: jest.Mock;
    getRecentActivity: jest.Mock;
  };

  beforeEach(async () => {
    const mockAuthService = {
      logout: jest.fn(),
      currentUser: signal({ name: 'Test User', roleName: 'Admin' }),
    };

    // F6 (`2026-09-08-f6-dashboard-redesign`): el componente ahora
    // inyecta `DashboardService` además de `AuthService`. La
    // aserción `expect(component).toBeTruthy()` sigue intacta (D1
    // del F6 redesign) — sólo se amplía el `providers` del
    // TestBed para que el inyector resuelva. Los tres métodos son
    // `jest.fn()` (no `of(...)` directo) para que S5 pueda
    // sobrescribir `getStats` con un error por test.
    mockDashboardService = {
      getStats: jest.fn().mockReturnValue(of(null)),
      getWeeklyStats: jest.fn().mockReturnValue(of({ days: [] })),
      getRecentActivity: jest.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    }).compileComponents();
  });

  /**
   * Crea el fixture y estabiliza el árbol. `TestBed.createComponent`
   * + `fixture.whenStable()` ya dispara el primer ciclo de detección
   * de cambios en este proyecto (Angular corre `ApplicationRef.tick()`
   * cuando la zona se estabiliza), así que `ngOnInit()` se ejecuta
   * DENTRO de `whenStable()`. Por eso los overrides de
   * `mockDashboardService` deben aplicarse ANTES de llamar a esta
   * función — si se aplican después, `ngOnInit` ya corrió con el
   * mock por defecto (`of(null)`) y el override llega tarde.
   */
  async function createComponent(): Promise<void> {
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  // W.1 (fixes-required.md, sdd-verify FAIL): S5 del spec no tenía
  // cobertura en ninguna capa. `getStats` falla con 500; el
  // `catchError` de `ngOnInit` enciende `error()` (D5: la falla de
  // un endpoint no aborta los otros) y el template pinta
  // `.error-banner`. El override del mock se hace ANTES de crear el
  // fixture (ver `createComponent()`).
  it('S5: muestra el banner de error si un endpoint del forkJoin falla', async () => {
    mockDashboardService.getStats.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );

    await createComponent();

    expect(component.error()).toBe(
      'No se pudo cargar el dashboard. Los datos pueden estar incompletos.',
    );
    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner).toBeTruthy();
    expect((banner.nativeElement as Element).textContent).toContain(
      'Algunos datos no se cargaron.',
    );
  });
});
