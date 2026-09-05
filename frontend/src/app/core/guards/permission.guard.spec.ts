import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { permissionGuard } from './permission.guard';
import { AuthService } from '../services/auth.service';

describe('permissionGuard', () => {
  let routerMock: any;
  let currentUserSignal: any;
  let mockAuthService: any;

  beforeEach(() => {
    routerMock = {
      navigate: jest.fn(),
    };
    currentUserSignal = signal<{ permissions: string[] } | null>({ permissions: ['CREATE'] });
    mockAuthService = {
      currentUser: currentUserSignal,
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerMock },
        { provide: AuthService, useValue: mockAuthService },
      ],
    });
  });

  it('returns true when route.data.permission is in user permissions', () => {
    const route = { data: { permission: 'CREATE' } } as any;
    const result = TestBed.runInInjectionContext(() => permissionGuard(route, null as any));
    expect(result).toBe(true);
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('navigates to /app/dashboard and returns false when user lacks permission', () => {
    const route = { data: { permission: 'DELETE' } } as any;
    const result = TestBed.runInInjectionContext(() => permissionGuard(route, null as any));
    expect(result).toBe(false);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/app/dashboard']);
  });

  it('returns true when route.data.permission is undefined', () => {
    const route = { data: {} } as any;
    const result = TestBed.runInInjectionContext(() => permissionGuard(route, null as any));
    expect(result).toBe(true);
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });
});
