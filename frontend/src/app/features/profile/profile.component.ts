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
import { UserService } from '../../core/services/user.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { UiPageHeaderComponent } from '../../shared/components/ui-page-header/ui-page-header.component';
import { UiIconComponent } from '../../shared/components/ui-icon/ui-icon.component';

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
 *    `roles-list` — `ngOnInit()` (carga) y `onSubmit()` (guardado)
 *    se llaman directamente.
 *  - **D1**: este componente SÍ tenía implementación previa. La
 *    nueva implementación refactoriza la misma clase en el mismo
 *    archivo (mismo selector, misma ruta, mismo export). Los
 *    consumidores (`/app/profile` en `app.routes.ts`) no cambian.
 *    Como no había spec file preexistente, D1 no aplica a un
 *    assertion — pero la cobertura del comportamiento preexistente
 *    se preserva en el nuevo spec.
 *
 * Fixes aplicados (`fixes-required.md`, post `sdd-verify` FAIL):
 *  - **C.1**: `currentUser.id` se usaba con `Number()` → `NaN` →
 *    `GET /users/NaN` (400). Ya no se necesita el id: se usa
 *    `UserService.getCurrentUser()` (`GET /users/me`, resuelto del
 *    JWT en el backend).
 *  - **C.2/C.4**: se reemplazó la reutilización de la
 *    `UsersService` admin (`/users/:id`, DTOs en español,
 *    `@RequirePermission` → 403 para no-admins) por el
 *    `UserService` dedicado (`core/services/user.service.ts`),
 *    con los nombres de campo reales del backend
 *    (`first_name`/`last_name`/`phone`) y sin guard de permiso.
 *  - **C.3**: el upload de avatar ya no viaja junto al submit del
 *    formulario — `ProfilePhotoUploaderComponent` sube el archivo
 *    directamente al seleccionarlo (`POST /users/me/avatar`, campo
 *    `avatar`) y emite `photoUploaded(url)`.
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
  private readonly userService = inject(UserService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly lastUpdatedAt = signal<string | null>(null);

  /** Email que se muestra como readonly (del usuario autenticado). */
  readonly displayEmail = signal<string>('');

  /** URL del avatar actual (del usuario o del último upload
   *  confirmado por el servidor). Se pasa al
   *  `ProfilePhotoUploaderComponent` vía `initialUrl`. */
  readonly avatarUrl = signal<string | null>(null);

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
    // C.1 fix: `currentUser.id` es un UUID string — `Number(uuid)`
    // producía `NaN` y el backend rechazaba `GET /users/NaN` con
    // 400. `UserService.getCurrentUser()` no necesita el id: pega a
    // `/users/me`, resuelto por el backend desde el JWT.
    this.displayEmail.set(currentUser.email ?? '');
    this.isLoading.set(true);

    this.userService
      .getCurrentUser()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.avatarUrl.set(user.avatar_url ?? null);
          this.profileForm.patchValue({
            nombres: user.first_name ?? '',
            apellidos: user.last_name ?? '',
            telefono: user.phone ?? '',
          });
          // `lastUpdatedAt` no se puebla desde `user.updated_at`:
          // la columna `updated_at` tiene `update: false` en
          // `UserEntity` (no se refresca automáticamente en cada
          // save), así que no es una fuente confiable (ver
          // fixes-required.md W.3). Se deja en null hasta el
          // primer `onSubmit()` exitoso de esta sesión.
          this.isLoading.set(false);
        },
        error: () => {
          this.toastService.error('Error al cargar el perfil.', 'Error');
          this.isLoading.set(false);
        },
      });
  }

  /** El upload ya ocurrió en `ProfilePhotoUploaderComponent` (C.3);
   *  acá sólo reflejamos la URL confirmada por el servidor. */
  onAvatarUploaded(avatarUrl: string): void {
    this.avatarUrl.set(avatarUrl);
    this.authService.updateCurrentUser({ avatar: avatarUrl ? { url: avatarUrl } : null });
  }

  onSubmit(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const form = this.profileForm.value;
    const payload = {
      first_name: form.nombres,
      last_name: form.apellidos,
      phone: form.telefono,
    };

    this.userService
      .updateProfile(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.authService.updateCurrentUser({
            name: `${form.nombres} ${form.apellidos}`,
            email: this.displayEmail(),
          });
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
