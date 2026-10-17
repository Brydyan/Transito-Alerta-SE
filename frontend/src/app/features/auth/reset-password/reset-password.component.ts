import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';

/**
 * ResetPasswordComponent — destino del link del email de
 * "¿Olvidaste tu contraseña?". Ruta `/reset-password?token=...`.
 *
 * 2026-10-16-forgot-reset-password-flow — reemplaza el wrapper
 * vanilla JS (`reset-password.component.js`). El link del email
 * apunta a la raíz (`${appBaseUrl}/reset-password`), no a
 * `/auth/reset-password` — el routing actual lo refleja.
 *
 * Validaciones:
 *  - sin `?token=` → form deshabilitado, mensaje inline.
 *  - password ≥ 12 chars + composición (uppercase, lowercase,
 *    digit, symbol) — alineado con el backend
 *    (`PasswordHasher.assertStrongEnough`). El HTML anterior
 *    decía `minlength="6"` — incorrecto.
 *  - password === passwordConfirm (validador a nivel de FormGroup).
 *  - errores del backend mapeados: 410 → "expirado", 404 → "no
 *    válido", default → "no se pudo restablecer".
 *  - éxito → navega a `/login` tras 3 segundos (tiempo suficiente
 *    para leer el mensaje de éxito).
 */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, UiIconComponent],
  template: `
    <section class="h-screen w-full flex overflow-hidden bg-bg-secondary">
      <div class="hidden md:block md:w-1/2 lg:w-7/12 h-full bg-brand-primary relative">
        <img
          src="/images/portada-panel-izq.png"
          alt="Imagen de portada en el panel izquierdo"
          class="absolute inset-0 w-full h-full object-cover opacity-90 mix-blend-luminosity"
        />
      </div>

      <div class="w-full md:w-1/2 lg:w-5/12 flex flex-col justify-center px-6 md:px-12 h-full">
        <div class="w-full mx-auto max-w-sm">
          <div class="mb-10 flex justify-center w-full">
            <img src="/images/logo-cte.png" class="max-w-[250px] h-auto mb-4" alt="Logo" />
          </div>

          <div class="mb-6 text-center">
            <h1 class="text-2xl font-bold text-slate-800 mb-1">Restablecer contraseña</h1>
            <p class="text-sm text-slate-500">Ingresa tu nueva contraseña para actualizar tu acceso.</p>
          </div>

          @if (tokenMissing()) {
            <div
              class="bg-prio-high/10 border border-prio-high/30 text-prio-high px-4 py-3 rounded mb-4 flex items-center gap-2 text-sm"
              role="alert"
              data-testid="reset-token-missing"
            >
              <ui-icon name="alert-triangle" [size]="16" [strokeWidth]="2" />
              <span>El enlace no es válido. Solicita un nuevo restablecimiento de contraseña.</span>
            </div>
          }

          @if (success()) {
            <div
              class="bg-status-resuelto/10 border border-status-resuelto/30 text-status-resuelto px-4 py-3 rounded mb-4 flex items-center gap-2 text-sm"
              role="alert"
              data-testid="reset-success"
            >
              <ui-icon name="check-circle" [size]="16" [strokeWidth]="2" />
              <span>Tu contraseña ha sido restablecida exitosamente.</span>
            </div>
          }

          @if (errorMessage()) {
            <div
              class="bg-prio-high/10 border border-prio-high/30 text-prio-high px-4 py-3 rounded mb-4 flex items-center gap-2 text-sm"
              role="alert"
              data-testid="reset-error"
            >
              <ui-icon name="alert-triangle" [size]="16" [strokeWidth]="2" />
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <form [formGroup]="resetForm" (ngSubmit)="onSubmit()" novalidate>
            <div class="mb-4">
              <label class="form-label" for="password">Nueva contraseña</label>
              <div class="relative">
                <input
                  [type]="showPassword() ? 'text' : 'password'"
                  id="password"
                  class="form-control pr-10"
                  formControlName="password"
                  placeholder="Mínimo 12 caracteres"
                  autocomplete="new-password"
                  data-testid="input-password"
                  [ngClass]="{ 'form-control-invalid': submitted() && f['password'].errors }"
                />
                <button
                  type="button"
                  class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none focus:text-slate-600"
                  data-testid="toggle-password-visibility"
                  [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                  [attr.aria-pressed]="showPassword()"
                  (click)="togglePassword()"
                >
                  <ui-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="18" [strokeWidth]="2" />
                </button>
              </div>
              @if (submitted() && f['password'].errors) {
                <div class="text-prio-high text-xs mt-1">
                  @if (f['password'].errors['required']) {
                    <div>La contraseña es requerida</div>
                  }
                  @if (f['password'].errors['minlength'] || f['password'].errors['pattern']) {
                    <div>Mínimo 12 caracteres con mayúscula, minúscula, dígito y símbolo.</div>
                  }
                </div>
              }
            </div>

            <div class="mb-4">
              <label class="form-label" for="password-confirm">Confirmar contraseña</label>
              <div class="relative">
              <input
                [type]="showConfirmPassword() ? 'text' : 'password'"
                id="password-confirm"
                class="form-control pr-10"
                formControlName="passwordConfirm"
                placeholder="Confirma tu nueva contraseña"
                autocomplete="new-password"
                data-testid="input-password-confirm"
                [ngClass]="{ 'form-control-invalid': submitted() && f['passwordConfirm'].errors }"
              />
              <button
                type="button"
                class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none focus:text-slate-600"
                data-testid="toggle-password-confirm-visibility"
                [attr.aria-label]="showConfirmPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                [attr.aria-pressed]="showConfirmPassword()"
                (click)="toggleConfirmPassword()"
              >
                <ui-icon [name]="showConfirmPassword() ? 'eye-off' : 'eye'" [size]="18" [strokeWidth]="2" />
              </button>
              </div>
              @if (submitted() && f['passwordConfirm'].errors) {
                <div class="text-prio-high text-xs mt-1">
                  @if (f['passwordConfirm'].errors['required']) {
                    <div>Confirma tu contraseña</div>
                  }
                  @if (f['passwordConfirm'].errors['passwordsMismatch']) {
                    <div>Las contraseñas no coinciden.</div>
                  }
                </div>
              }
            </div>

            <div class="mb-4 mt-6">
              <button
                type="submit"
                class="btn btn-primary w-full py-2.5 disabled:opacity-70 disabled:cursor-not-allowed"
                data-testid="btn-restablecer"
                [disabled]="loading() || tokenMissing()"
              >
                @if (!loading()) {
                  <span>Restablecer contraseña</span>
                }
                @if (loading()) {
                  <span class="flex items-center">
                    <svg
                      class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Restableciendo...
                  </span>
                }
              </button>
            </div>

            <div class="text-center mt-6">
              <a
                routerLink="/login"
                class="text-slate-500 underline text-sm hover:text-brand-primary font-medium transition-colors inline-flex items-center gap-2"
                data-testid="link-back-to-login"
              >
                <ui-icon name="arrow-left" [size]="14" [strokeWidth]="2" />
                Volver al inicio de sesión
              </a>
            </div>
          </form>
        </div>
      </div>
    </section>
  `,
  styleUrl: './reset-password.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** 2026-10-16 — `?token=...` de la URL. null si el link no trae token. */
  readonly token: string | null =
    this.route.snapshot.queryParamMap.get('token') ?? null;
  readonly tokenMissing = signal(this.token === null);

  // 2026-10-16 — 12 caracteres mínimo con composición (alineado
  // con `PasswordHasher.assertStrongEnough` del backend). El
  // HTML viejo decía minlength=6, que pasaba el regex del backend
  // solo si la composición cumplía — pero el minlength en el
  // browser mostraba error distinto al del backend. Unificado.
  // (?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}
  private static readonly STRONG_PASSWORD =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

  readonly resetForm: FormGroup = this.formBuilder.group(
    {
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(12),
          Validators.pattern(ResetPasswordComponent.STRONG_PASSWORD),
        ],
      ],
      passwordConfirm: ['', [Validators.required]],
    },
    { validators: [passwordsMatchValidator] },
  );

  readonly submitted = signal(false);
  readonly loading = signal(false);
  readonly success = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  get f() {
    return this.resetForm.controls as Record<string, AbstractControl>;
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  onSubmit(): void {
    if (this.tokenMissing()) {
      return;
    }
    this.submitted.set(true);
    this.errorMessage.set(null);

    if (this.resetForm.invalid) {
      // Distinguir el caso "contraseñas no coinciden" para mostrar
      // el mensaje user-facing. El resto de errores (minLength,
      // pattern) los pinta el form-control-invalid + el bloque
      // de errores bajo el input.
      if (this.resetForm.errors?.['passwordsMismatch']) {
        this.errorMessage.set('Las contraseñas no coinciden.');
      }
      return;
    }

    this.loading.set(true);
    const password = this.resetForm.value.password as string;

    this.authService.confirmPasswordReset(this.token!, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
        // Da tiempo a leer el mensaje de éxito antes de mandar al login.
        setTimeout(() => this.router.navigate(['/login']), 3000);
      },
      error: (err: { status?: number; message?: string }) => {
        this.loading.set(false);
        this.submitted.set(false);
        this.errorMessage.set(this.errorMessageFor(err));
      },
    });
  }

  /** Mapeo de status codes → mensaje user-facing en español. */
  private errorMessageFor(err: { status?: number; message?: string }): string {
    switch (err.status) {
      case 410:
        return 'El enlace ha expirado o ya fue usado. Solicita uno nuevo.';
      case 404:
        return 'El enlace no es válido.';
      default:
        return err.message ?? 'No se pudo restablecer la contraseña. Intenta de nuevo.';
    }
  }
}

/**
 * Validador a nivel de FormGroup: ambos campos deben coincidir.
 * Devuelve `{ passwordsMismatch: true }` cuando difieren; null
 * en caso contrario. El frontend valida ANTES de mandar al
 * backend (regla de UX) — el backend ya valida server-side y
 * devuelve 400 si difieren.
 */
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('passwordConfirm')?.value;
  if (password && confirm && password !== confirm) {
    return { passwordsMismatch: true };
  }
  return null;
}