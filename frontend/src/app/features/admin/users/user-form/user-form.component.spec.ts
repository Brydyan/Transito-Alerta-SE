import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';

import { UserFormComponent } from './user-form.component';
import { UsersService } from '../services/users.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { AuthService } from '../../../../core/services/auth.service';
import type { PermissionItem } from '../models/user.interface';

/**
 * sc-340 (R5) — contract of `UserFormComponent` around the user
 * permissions panel: the search filter never throws on entries
 * without a legible name, and rows render legible labels with a
 * real `trackBy` identifier.
 *
 * Setup runs in create mode (no `:id` route param) as `master` so the
 * permissions panel is visible and `getPermissions()` is requested.
 */
describe('UserFormComponent (sc-340 user permissions panel)', () => {
  let component: UserFormComponent;
  let fixture: ComponentFixture<UserFormComponent>;

  let mockUsersService: {
    getRoles: jest.Mock;
    getPermissions: jest.Mock;
    getUserById: jest.Mock;
    getOrganizations: jest.Mock;
    getRoleById: jest.Mock;
  };

  beforeEach(async () => {
    mockUsersService = {
      getRoles: jest.fn().mockReturnValue(of([])),
      getPermissions: jest.fn().mockReturnValue(of([])),
      getUserById: jest.fn(),
      getOrganizations: jest.fn().mockReturnValue(of([])),
      getRoleById: jest.fn().mockReturnValue(of({ rolId: '', nombre: '', permisos: [] })),
    };

    await TestBed.configureTestingModule({
      imports: [UserFormComponent],
      providers: [
        provideRouter([]),
        FormBuilder,
        { provide: UsersService, useValue: mockUsersService },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        {
          provide: AuthService,
          useValue: { currentUser: jest.fn().mockReturnValue({ id: 'admin-1', roleName: 'master' }) },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: jest.fn().mockReturnValue(null) } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserFormComponent);
    component = fixture.componentInstance;
  });

  describe('sc-340 T13/R5 filteredAllPerms null-safety', () => {
    it('typing in the permission search does not throw when an entry lacks a legible name', () => {
      fixture.detectChanges();
      // Entry without `nombre`/`recurso`/`accion` (the pre-sc-340
      // service passed the raw wire through, so the panel could hold
      // exactly this shape).
      component.allPermissions.set([{ permisoId: 'perm-1' } as PermissionItem]);
      component.userPermSearch.set('read');
      expect(() => component.filteredAllPerms()).not.toThrow();
    });

    it('a search with no matches returns an empty list', () => {
      fixture.detectChanges();
      component.allPermissions.set([
        {
          permisoId: 'perm-1',
          nombre: 'READ dashboard',
          descripcion: '',
          recurso: 'dashboard',
          accion: 'READ',
        },
      ]);
      component.userPermSearch.set('zzz-no-match');
      expect(component.filteredAllPerms()).toEqual([]);
    });
  });

  describe('sc-340 T15/R5 user permissions render', () => {
    // Entries in the shape of the real wire: the identifier, resource
    // and action travel as `id`/`resource`/`action`, while the model
    // fields the template binds are empty (unmapped). Spread onto a
    // model-shaped base so the fixture stays type-clean without casts;
    // at runtime the panel receives wire-shaped data.
    const wireShaped = [
      { id: 'perm-uuid-1', resource: 'dashboard', action: 'READ' },
      { id: 'perm-uuid-2', resource: 'incidents', action: 'UPDATE' },
    ].map((w) => ({
      permisoId: '',
      nombre: '',
      descripcion: '',
      recurso: '',
      accion: '',
      ...w,
    }));

    it('every row shows a legible label and trackBy receives a real identifier', () => {
      mockUsersService.getPermissions.mockReturnValue(of(wireShaped));
      fixture.detectChanges();

      const labels = Array.from(
        fixture.nativeElement.querySelectorAll(
          'label[for^="user-perm-"]',
        ) as NodeListOf<HTMLElement>,
      ).map((el) => el.textContent ?? '');
      expect(labels.some((t) => t.includes('READ dashboard'))).toBe(true);
      expect(labels.some((t) => t.includes('UPDATE incidents'))).toBe(true);

      const ids = Array.from(
        fixture.nativeElement.querySelectorAll(
          'input[id^="user-perm-"]',
        ) as NodeListOf<HTMLElement>,
      ).map((el) => el.getAttribute('id') ?? '');
      expect(ids).toEqual(['user-perm-perm-uuid-1', 'user-perm-perm-uuid-2']);
    });
  });
});
