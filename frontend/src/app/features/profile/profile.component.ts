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
import { UserDetail } from '../admin/users/models/user.interface';

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

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
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
  readonly isUploadingAvatar = signal(false);
  readonly avatarPreview = signal<string | null>(null);
  readonly roleName = signal<string | null>(null);

  private pendingAvatarFile: File | null = null;
  private userId = 0;

  profileForm: FormGroup = this.fb.group({
    nombres: ['', Validators.required],
    apellidos: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
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

    // Pre-populate avatar from cached signal immediately — avoids blank avatar during load
    if (currentUser.avatar?.url) {
      this.avatarPreview.set(currentUser.avatar.url);
    }

    this.isLoading.set(true);

    this.usersService
      .getUserById(this.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user: UserDetail) => {
          if (user.avatar?.url) {
            this.avatarPreview.set(user.avatar.url);
          }
          this.roleName.set(user.rol?.nombre ?? null);
          this.profileForm.patchValue({
            nombres: user.nombres,
            apellidos: user.apellidos,
            email: user.email,
            telefono: user.telefono,
          });
          this.isLoading.set(false);
        },
        error: () => {
          this.toastService.error('Error al cargar el perfil.', 'Error');
          this.isLoading.set(false);
        },
      });
  }

  onAvatarSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.pendingAvatarFile = file;
    this.isUploadingAvatar.set(true);
    const reader = new FileReader();
    reader.onload = () => {
      this.avatarPreview.set(reader.result as string);
      this.isUploadingAvatar.set(false);
    };
    reader.readAsDataURL(file);
  }

  onSubmit(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const form = this.profileForm.value;

    const payload = {
      email: form.email,
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
            email: form.email,
            avatar: updatedUser.avatar ?? null,
          });
          this.pendingAvatarFile = null;
          this.toastService.success('Perfil actualizado correctamente.', 'Éxito');
          this.isSaving.set(false);
        },
        error: (err) => {
          const msg = err.error?.message || 'Error al actualizar el perfil.';
          this.toastService.error(msg, 'Error');
          this.isSaving.set(false);
        },
      });
  }
}
