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
} from '@angular/forms';
import { RouterModule } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';

/**
 * ForgotPasswordComponent — flujo "¿Olvidaste tu contraseña?".
 *
 * 2026-10-16-forgot-reset-password-flow — reemplaza el wrapper
 * vanilla JS (`forgot-password.component.js`) que vivía debajo
 * de un árbol de rutas no-Angular y no estaba registrado en
 * `app.routes.ts`. El link del login navegaba a una ruta
 * inexistente.
 *
 * El backend siempre responde 200 (design D9) para no leakear
 * si el email existe — la pantalla muestra el mismo mensaje
 * genérico ("Te hemos enviado un enlace...") en ambos casos.
 * Esto evita el clásico user-enumeration attack vector.
 */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, UiIconComponent],
  template: `
    <section class="h-screen w-full flex overflow-hidden bg-bg-secondary">
      <!-- Left Side: Image / Illustration -->
      <div class="hidden md:block md:w-1/2 lg:w-7/12 h-full bg-brand-primary relative">
        <img
          src="/images/portada-panel-izq.png"
          alt="Imagen de portada en el panel izquierdo"
          class="absolute inset-0 w-full h-full object-cover opacity-90 mix-blend-luminosity"
        />
      </div>

      <!-- Right Side: Form -->
      <div class="w-full md:w-1/2 lg:w-5/12 flex flex-col justify-center px-6 md:px-12 h-full">
        <div class="w-full mx-auto max-w-sm">
          <div class="mb-10 flex justify-center w-full">
            <img src="/images/logo-cte.png" class="max-w-[250px] h-auto mb-4" alt="Logo" />
          </div>

          <div class="mb-6 text-center">
            <h1 class="text-2xl font-bold text-slate-800 mb-1">¿Olvidaste tu contraseña?</h1>
            <p class="text-sm text-slate-500">No te preocupes. Te enviaremos un enlace seguro a tu correo.</p>
          </div>

          <form [formGroup]="forgotForm" (ngSubmit)="onSubmit()" novalidate>
            @if (success()) {
              <div
                class="bg-status-resuelto/10 border border-status-resuelto/30 text-status-resuelto px-4 py-3 rounded mb-4 flex items-center gap-2 text-sm"
                role="alert"
                data-testid="forgot-success"
              >
                <ui-icon name="check-circle" [size]="16" [strokeWidth]="2" />
                <span>Te hemos enviado un enlace de restablecimiento por correo electrónico.</span>
              </div>
            }

            @if (errorMessage()) {
              <div
                class="bg-prio-high/10 border border-prio-high/30 text-prio-high px-4 py-3 rounded mb-4 flex items-center gap-2 text-sm"
                role="alert"
                data-testid="forgot-error"
              >
                <ui-icon name="alert-triangle" [size]="16" [strokeWidth]="2" />
                <span>{{ errorMessage() }}</span>
              </div>
            }

            <div class="mb-4">
              <label class="form-label" for="email">Correo electrónico</label>
              <input
                type="email"
                id="email"
                class="form-control"
                formControlName="email"
                placeholder="tu.correo@ejemplo.com"
                autocomplete="email"
                data-testid="input-email"
                [ngClass]="{ 'form-control-invalid': submitted() && f['email'].errors }"
              />
              @if (submitted() && f['email'].errors) {
                <div class="text-prio-high text-xs mt-1">
                  @if (f['email'].errors['required']) {
                    <div>El correo es requerido</div>
                  }
                  @if (f['email'].errors['email']) {
                    <div>Debe ser un correo válido</div>
                  }
                </div>
              }
            </div>

            <div class="mb-4 mt-6">
              <button
                type="submit"
                class="btn btn-primary w-full py-2.5 disabled:opacity-70 disabled:cursor-not-allowed"
                data-testid="btn-enviar"
                [disabled]="loading()"
              >
                @if (!loading()) {
                  <span>Enviar enlace de recuperación</span>
                }
                @if (loading()) {
                  <span class="flex items-center">
                    <svg
                      class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      ></circle>
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Enviando...
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
  styleUrl: './forgot-password.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly forgotForm: FormGroup = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly submitted = signal(false);
  readonly loading = signal(false);
  readonly success = signal(false);
  readonly errorMessage = signal<string | null>(null);

  get f() {
    return this.forgotForm.controls as Record<string, AbstractControl>;
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.errorMessage.set(null);

    if (this.forgotForm.invalid) {
      return;
    }

    this.loading.set(true);
    const email = (this.forgotForm.value.email as string).trim();

    this.authService.requestPasswordReset(email).subscribe({
      next: () => {
        this.loading.set(false);
        // Siempre mensaje genérico — el backend nunca confirma si el
        // email existe (design D9 anti-enumeration).
        this.success.set(true);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.submitted.set(false);
        this.errorMessage.set(
          err.message ?? 'No pudimos enviar el enlace. Intenta de nuevo en unos minutos.',
        );
      },
    });
  }
}