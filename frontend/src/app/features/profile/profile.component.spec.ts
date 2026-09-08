import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '../../core/services/auth.service';
import { UserService, UserProfile } from '../../core/services/user.service';
import { ToastService } from '../../shared/components/toast/toast.service';

import { ProfileComponent } from './profile.component';

/**
 * F6 perfil-redesign fixes (`fixes-required.md` C.1/C.2/C.4) — el
 * componente ya no usa la `UsersService` admin (`/users/:id`), sino
 * el `UserService` dedicado (`/users/me`), con los campos reales del
 * backend (`first_name`/`last_name`/`phone`).
 */
describe('ProfileComponent (F6 rediseño — fixes C.1/C.2/C.4)', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let mockUserService: {
    getCurrentUser: jest.Mock;
    updateProfile: jest.Mock;
    uploadProfileImage: jest.Mock;
  };
  let mockToast: { success: jest.Mock; error: jest.Mock };

  const fixtureUser: UserProfile = {
    id: 'c3b1a2d4-0000-4000-8000-000000000001',
    first_name: 'Juan',
    last_name: 'Pérez',
    email: 'juan@test.com',
    phone: '+593991234567',
    avatar_url: 'https://cdn.example.com/avatar.jpg',
    updated_at: '2026-09-08T12:00:00.000Z',
  };

  /** Crea TestBed, instancia el component, espera la carga
   *  asíncrona del `getCurrentUser()` y aplica `detectChanges`. */
  function createComponent(): void {
    const mockAuthService = {
      // C.1: `id` es un UUID string, no numérico.
      currentUser: signal({
        id: 'c3b1a2d4-0000-4000-8000-000000000001',
        email: 'juan@test.com',
        name: 'Juan Pérez',
        roleName: 'ADMIN ORG',
      }),
      updateCurrentUser: jest.fn(),
    };
    mockUserService = {
      getCurrentUser: jest.fn().mockReturnValue(of(fixtureUser)),
      updateProfile: jest.fn().mockReturnValue(of(fixtureUser)),
      uploadProfileImage: jest.fn().mockReturnValue(of(fixtureUser)),
    };
    mockToast = { success: jest.fn(), error: jest.fn() };

    TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: UserService, useValue: mockUserService },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('se crea y carga los datos del usuario vía UserService.getCurrentUser()', waitForAsync(() => {
    createComponent();
    fixture.whenStable().then(() => {
      fixture.detectChanges();
      expect(component).toBeTruthy();
      expect(mockUserService.getCurrentUser).toHaveBeenCalledTimes(1);
      expect(component.profileForm.get('nombres')?.value).toBe('Juan');
      expect(component.profileForm.get('apellidos')?.value).toBe('Pérez');
      expect(component.profileForm.get('telefono')?.value).toBe('+593991234567');
      expect(component.displayEmail()).toBe('juan@test.com');
      expect(component.avatarUrl()).toBe('https://cdn.example.com/avatar.jpg');
    });
  }));

  it('email es readonly en el DOM (P.4.1)', waitForAsync(() => {
    createComponent();
    fixture.whenStable().then(() => {
      fixture.detectChanges();
      const emailInput = fixture.nativeElement.querySelector(
        '#prof-email',
      ) as HTMLInputElement | null;
      expect(emailInput).toBeTruthy();
      expect(emailInput!.readOnly).toBe(true);
      expect(emailInput!.getAttribute('aria-readonly')).toBe('true');
    });
  }));

  it('valida nombres requeridos (min 2 caracteres)', () => {
    createComponent();
    const control = component.profileForm.get('nombres');
    control?.setValue('');
    control?.markAsDirty();
    expect(component.campoInvalido('nombres')).toBe(true);

    control?.setValue('A');
    expect(component.campoInvalido('nombres')).toBe(true);

    control?.setValue('Juan');
    expect(component.campoInvalido('nombres')).toBe(false);
  });

  it('valida teléfonos con prefijo ecuatoriano', () => {
    createComponent();
    const control = component.profileForm.get('telefono');
    control?.setValue('12345');
    control?.markAsTouched();
    expect(control?.errors?.['invalidPrefix']).toBeTruthy();

    control?.setValue('+593991234567');
    expect(control?.errors).toBeNull();
  });

  it('onSubmit: formulario inválido marca todos los campos como touched', () => {
    createComponent();
    component.profileForm.patchValue({ nombres: '' });
    component.onSubmit();
    expect(component.profileForm.get('nombres')?.touched).toBe(true);
    expect(component.profileForm.get('apellidos')?.touched).toBe(true);
    expect(component.profileForm.get('telefono')?.touched).toBe(true);
  });

  it('onSubmit exitoso: llama updateProfile con payload snake_case, muestra toast y actualiza timestamp', waitForAsync(() => {
    createComponent();
    fixture.whenStable().then(() => {
      fixture.detectChanges();
      component.onSubmit();
      fixture.whenStable().then(() => {
        expect(mockUserService.updateProfile).toHaveBeenCalledTimes(1);
        // C.2: campos en inglés/snake_case, no {nombres, apellidos, telefono}.
        expect(mockUserService.updateProfile).toHaveBeenCalledWith({
          first_name: 'Juan',
          last_name: 'Pérez',
          phone: '+593991234567',
        });
        expect(mockToast.success).toHaveBeenCalledWith(
          'Perfil actualizado correctamente.',
          'Éxito',
        );
        expect(component.lastUpdatedAt()).toBeTruthy();
        expect(component.isSaving()).toBe(false);
      });
    });
  }));

  it('onSubmit 500: muestra toast de error y conserva el formulario', waitForAsync(() => {
    createComponent();
    fixture.whenStable().then(() => {
      fixture.detectChanges();
      mockUserService.updateProfile.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      component.onSubmit();
      fixture.whenStable().then(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          'Error al actualizar el perfil.',
          'Error',
        );
        expect(component.isSaving()).toBe(false);
        expect(component.lastUpdatedAt()).toBeNull();
      });
    });
  }));

  it('onAvatarUploaded refleja la url que confirma el servidor (upload ya ocurrió en el hijo)', waitForAsync(() => {
    createComponent();
    fixture.whenStable().then(() => {
      fixture.detectChanges();
      component.onAvatarUploaded('https://cdn.example.com/new-avatar.jpg');
      expect(component.avatarUrl()).toBe('https://cdn.example.com/new-avatar.jpg');
    });
  }));

  it('getCurrentUser 500: muestra toast de error y termina loading', waitForAsync(() => {
    createComponent();
    fixture.whenStable().then(() => {
      // Sobrescribe el mock y re-crea el component para que el
      // ngOnInit corra con la falla. Es el patrón más simple sin
      // re-arquitecturarlo.
      mockUserService.getCurrentUser.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      const newFixture = TestBed.createComponent(ProfileComponent);
      newFixture.componentInstance.ngOnInit();
      newFixture.detectChanges();
      newFixture.whenStable().then(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          'Error al cargar el perfil.',
          'Error',
        );
        expect(newFixture.componentInstance.isLoading()).toBe(false);
      });
    });
  }));
});
