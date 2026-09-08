import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../admin/users/services/users.service';
import { ToastService } from '../../shared/components/toast/toast.service';

import { ProfileComponent } from './profile.component';

describe('ProfileComponent (F6 rediseño)', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let mockUsersService: {
    getUserById: jest.Mock;
    updateMe: jest.Mock;
  };
  let mockToast: { success: jest.Mock; error: jest.Mock };

  const fixtureUser = {
    usuarioId: 1,
    nombres: 'Juan',
    apellidos: 'Pérez',
    email: 'juan@test.com',
    telefono: '+593991234567',
    rol: { rolId: 1, nombre: 'ADMIN ORG' },
    avatar: { url: 'https://cdn.example.com/avatar.jpg' },
  };

  /** Crea TestBed, instancia el component, espera la carga
   *  asíncrona del `getUserById()` y aplica `detectChanges`. */
  function createComponent(): void {
    const mockAuthService = {
      currentUser: signal({
        id: 1,
        email: 'juan@test.com',
        name: 'Juan Pérez',
        roleName: 'ADMIN ORG',
      }),
      updateCurrentUser: jest.fn(),
    };
    mockUsersService = {
      getUserById: jest.fn().mockReturnValue(of(fixtureUser)),
      updateMe: jest.fn().mockReturnValue(of(fixtureUser)),
    };
    mockToast = { success: jest.fn(), error: jest.fn() };

    TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('se crea y carga los datos del usuario', waitForAsync(() => {
    createComponent();
    fixture.whenStable().then(() => {
      fixture.detectChanges();
      expect(component).toBeTruthy();
      expect(component.profileForm.get('nombres')?.value).toBe('Juan');
      expect(component.profileForm.get('apellidos')?.value).toBe('Pérez');
      expect(component.profileForm.get('telefono')?.value).toBe('+593991234567');
      expect(component.displayEmail()).toBe('juan@test.com');
      expect(component.roleName()).toBe('ADMIN ORG');
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

  it('onSubmit exitoso: llama updateMe, muestra toast y actualiza timestamp', waitForAsync(() => {
    createComponent();
    fixture.whenStable().then(() => {
      fixture.detectChanges();
      component.onSubmit();
      fixture.whenStable().then(() => {
        expect(mockUsersService.updateMe).toHaveBeenCalledTimes(1);
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
      mockUsersService.updateMe.mockReturnValue(
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

  it('onAvatarFileSelected guarda el file pendiente', waitForAsync(() => {
    createComponent();
    fixture.whenStable().then(() => {
      fixture.detectChanges();
      const file = new File(['x'], 'avatar.jpg', { type: 'image/jpeg' });
      component.onAvatarFileSelected(file);
      mockUsersService.updateMe.mockClear();
      component.onSubmit();
      fixture.whenStable().then(() => {
        expect(mockUsersService.updateMe).toHaveBeenCalledWith(
          expect.objectContaining({}),
          file,
        );
      });
    });
  }));

  it('getUserById 500: muestra toast de error y termina loading', waitForAsync(() => {
    createComponent();
    fixture.whenStable().then(() => {
      // Sobrescribe el mock y re-crea el component para que el
      // ngOnInit corra con la falla. Es el patrón más simple
      // sin re-arquitecturarlo.
      mockUsersService.getUserById.mockReturnValue(
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
