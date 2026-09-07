import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { HasPermissionDirective } from './has-permission.directive';
import { AuthService } from '../../core/services/auth.service';

describe('HasPermissionDirective', () => {
  let currentUserSignal: any;
  let mockAuthService: any;

  beforeEach(() => {
    currentUserSignal = signal<{ permissions: string[] } | null>({ permissions: ['CREATE'] });
    mockAuthService = {
      currentUser: currentUserSignal,
    };
  });

  it('renders the embedded content when the user has the permission', async () => {
    await render(`<div *hasPermission="'CREATE'">shown</div>`, {
      imports: [HasPermissionDirective],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    expect(screen.queryByText('shown')).toBeTruthy();
  });

  it('does not render when the user lacks the permission', async () => {
    await render(`<div *hasPermission="'DELETE'">shown</div>`, {
      imports: [HasPermissionDirective],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    expect(screen.queryByText('shown')).toBeNull();
  });

  it('reacts to a permission change', async () => {
    const { fixture } = await render(`<div *hasPermission="'CREATE'">shown</div>`, {
      imports: [HasPermissionDirective],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    expect(screen.queryByText('shown')).toBeTruthy();

    // Revoke permission
    currentUserSignal.set({ permissions: [] });
    fixture.detectChanges();

    expect(screen.queryByText('shown')).toBeNull();

    // Grant permission again
    currentUserSignal.set({ permissions: ['CREATE'] });
    fixture.detectChanges();

    expect(screen.queryByText('shown')).toBeTruthy();
  });
});
