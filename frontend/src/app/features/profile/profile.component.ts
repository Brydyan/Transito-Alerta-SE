import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { UsersService } from '../admin/users/services/users.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { UiPageHeaderComponent } from '../../shared/components/ui-page-header/ui-page-header.component';
import { UiIconComponent } from '../../shared/components/ui-icon/ui-icon.component';
import { UserDetail } from '../admin/users/models/user.interface';

import { ProfilePhotoUploaderComponent } from './components/profile-photo-uploader.component';
import { ProfileActionCardsComponent } from './components/profile-action-cards.component';

/**
 * Validador de teléfono ecuatoriano (P.4.1): prefijo +593 o 09,
 * 10-12 dígitos, sólo números (con `+` opcional al inicio).
 */
export function ecuadorPhoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const val = String(control.value).trim();
    if (!val.startsWith('+593') && !val.startsWith('09')) {
      return { invalidPrefix: true };
    }
    const lengthWithoutPlus = val.replace('+', '').length;
    if (lengthWithoutPlus < 10 || lengthWithoutPlus > 12) {
      return { invalidLength: true };
    }
    if (!/^\+?\d+$/.test(val)) {
      return { invalidFormat: true };
    }
    return null;
  };
}

/**
 * ProfileComponent rediseñado — F6 (`2026-09-08-f6-perfil-redesign`).
 *
 * Layout del mock 10-01:
 *  - `ui-page-header` con kicker "CATÁLOGOS" + título "Mi Perfil" + subtítulo
 *  - Sección "Información Personal" con:
 *    - `ProfilePhotoUploaderComponent` (avatar 128×128, file picker,
 *      preview) — sub-componente reusado
 *    - Formulario reactivo inline (P.1.4 dice "or inline in main")
 *  - Aviso de privacidad
 *  - Botón "Guardar Cambios" + timestamp "Última actualización"
 *  - `ProfileActionCardsComponent` (3 tarjetas al pie)
 *
 * Decisiones aplicadas:
 *  - **Email readonly** (P.4.1): el email es identidad, no se permite
 *    auto-modificar.
 *  - **No `*hasPermission`**: el perfil es universal para usuarios
 *    autenticados.
 *  - **Sin `forkJoin`**: mismo argumento que `users-list` y
 *    `roles-list` — `loadProfile()` y `updateMe()` se llaman
 *    directamente.
 *  - **D1**: este componente SÍ tenía implementación previa. La
 *    nueva implementación refactoriza la misma clase en el mismo
 *    archivo (mismo selector, misma ruta, mismo export). Los
 *    consumidores (`/app/profile` en `app.routes.ts`) no cambian.
 *    Como no había spec file preexistente, D1 no aplica a un
 *    assertion — pero la cobertura del comportamiento preexistente
 *    se preserva en el nuevo spec.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiPageHeaderComponent,
    UiIconComponent,
    ProfilePhotoUploaderComponent,
    ProfileActionCardsComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly usersService = inject(UsersService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly roleName = signal<string | null>(null);
  readonly lastUpdatedAt = signal<string | null>(null);

  /** Email que se muestra como readonly (del usuario autenticado). */
  readonly displayEmail = signal<string>('');

  /** URL del avatar actual (del usuario o de la preview). Se pasa
   *  al `ProfilePhotoUploaderComponent` vía `initialUrl`. */
  readonly avatarUrl = signal<string | null>(null);

  private pendingAvatarFile: File | null = null;
  private userId = 0;

  readonly profileForm: FormGroup = this.fb.group({
    nombres: ['', [Validators.required, Validators.minLength(2)]],
    apellidos: ['', [Validators.required, Validators.minLength(2)]],
    telefono: ['', [Validators.required, ecuadorPhoneValidator()]],
  });

  campoInvalido(campo: string): boolean {
    const control = this.profileForm.get(campo);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  ngOnInit(): void {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      this.router.navigate(['/login']);
      return;
    }
    this.userId = Number(currentUser.id);
    this.displayEmail.set(currentUser.email ?? '');
    this.isLoading.set(true);

    this.usersService
      .getUserById(this.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user: UserDetail) => {
          this.avatarUrl.set(user.avatar?.url ?? null);
          this.roleName.set(user.rol?.nombre ?? null);
          this.profileForm.patchValue({
            nombres: user.nombres,
            apellidos: user.apellidos,
            telefono: user.telefono,
          });
          // `lastUpdatedAt` no viene del backend; lo dejamos en
          // null para que el template no muestre el timestamp
          // cuando el backend aún no lo expone. (Ver
          // apply-progress.md — D1 de esta fase.)
          this.isLoading.set(false);
        },
        error: () => {
          this.toastService.error('Error al cargar el perfil.', 'Error');
          this.isLoading.set(false);
        },
      });
  }

  onAvatarFileSelected(file: File): void {
    this.pendingAvatarFile = file;
  }

  onSubmit(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const form = this.profileForm.value;
    const payload = {
      email: this.displayEmail(), // readonly, se envía tal cual
      nombres: form.nombres,
      apellidos: form.apellidos,
      telefono: form.telefono,
    };

    this.usersService
      .updateMe(payload, this.pendingAvatarFile ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedUser) => {
          this.authService.updateCurrentUser({
            name: `${form.nombres} ${form.apellidos}`,
            email: this.displayEmail(),
            avatar: updatedUser.avatar ?? null,
          });
          this.avatarUrl.set(updatedUser.avatar?.url ?? null);
          this.pendingAvatarFile = null;
          this.lastUpdatedAt.set(this.formatNow());
          this.toastService.success('Perfil actualizado correctamente.', 'Éxito');
          this.isSaving.set(false);
        },
        error: () => {
          this.toastService.error('Error al actualizar el perfil.', 'Error');
          this.isSaving.set(false);
        },
      });
  }

  private formatNow(): string {
    // Formato "dd/mm/yyyy, h:mm:ss a.m./p.m." (mock 10-01).
    return new Date().toLocaleString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }
}
