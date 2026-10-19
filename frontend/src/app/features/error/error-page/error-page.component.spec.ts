import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { ErrorPageComponent } from './error-page.component';
import { AuthService } from '../../../core/services/auth.service';

describe('ErrorPageComponent', () => {
  let component: ErrorPageComponent;
  let fixture: ComponentFixture<ErrorPageComponent>;

  beforeEach(async () => {
    // 2026-10-19-dashboard-permission-gate — el componente ahora
    // inyecta `AuthService` para elegir el destino del botón
    // según el rol. Stub mínimo: `user()` devuelve `null`, lo
    // que colapsa el computed al default staff (`/app/dashboard`).
    await TestBed.configureTestingModule({
      imports: [ErrorPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal(null) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ErrorPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
