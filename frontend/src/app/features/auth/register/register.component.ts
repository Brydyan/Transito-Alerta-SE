import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { UiCardComponent } from '../../../shared/components/ui-card/ui-card.component';

/**
 * REG (sc-325) — pantalla de auto-registro del ciudadano.
 *
 * Es la primera ruta alcanzable sin sesión del producto (D5). La
 * URL es `/registro` y vive en `app.routes.ts` con `guestGuard`,
 * NO con `authGuard`. Si un usuario autenticado la abre, el
 * `guestGuard` lo redirige al dashboard.
 *
 * **Validación de cliente (B.7 / D7):** el formulario exige correo
 * + política de contraseña **antes** de llamar al servidor. La
 * política es la misma que el backend (12+ chars, mayúscula,
 * minúscula, dígito, símbolo) — sincronizada con
 * `RegisterDto` y `PasswordHasher.assertStrongEnough` del
 * backend. Si no coinciden, el servidor devuelve 422 y la
 * pantalla muestra el mensaje del backend.
 *
 * **D3 (no-revelación):** el backend devuelve la misma forma
 * para "correo nuevo" y "correo ya registrado". El cliente no
 * puede distinguirlos; navega al `verify-email` en ambos casos.
 *
 * **D5 (D5 — link desde login):** el link se monta en
 * `login.component.html` y `app.routes.ts`.
 */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, UiCardComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly registerForm: FormGroup;
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  /**
   * Mismo mensaje que `verify-email` recibe como hint: "revisá
   * tu correo" es válido para "correo nuevo" Y para "correo
   * existente" (D3 — sin oráculo de existencia).
   */
  private readonly successMessage =
    'Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta. Si ya lo estaba, te enviamos un aviso al titular.';

  constructor() {
    this.registerForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(12),
          Validators.maxLength(128),
          // Política de complejidad — sincronizada con
          // `PasswordHasher.assertStrongEnough` del backend
          // (REG / design D2). El regex es la misma idea:
          // 12+ chars con mayúscula, minúscula, dígito y símbolo.
          // Si el backend la cambia allá, hay que cambiarla
          // acá también; documentado en `auth-errors.ts` y en
          // el design.
          Validators.pattern(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{12,}$/,
          ),
        ],
      ],
      first_name: ['', [Validators.required, Validators.maxLength(100)]],
      last_name: ['', [Validators.required, Validators.maxLength(100)]],
    });
  }

  get f() {
    return this.registerForm.controls;
  }

  onSubmit(): void {
    this.errorMessage.set(null);
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    const { email, password, first_name, last_name } = this.registerForm.value;
    this.authService.register({ email, password, first_name, last_name }).subscribe({
      next: () => {
        this.loading.set(false);
        // D3 — siempre navegamos al verify-email. El backend
        // ya mandó el OTP (o el aviso al titular si el correo
        // existía); cualquiera de los dos caminos aterriza acá.
        this.router.navigate(['/verify-email'], {
          queryParams: { email, hint: this.successMessage },
        });
      },
      error: (err) => {
        this.loading.set(false);
        // D4 — rate limit. 429 con código REGISTRATION_RATE_LIMITED.
        if (err?.status === 429) {
          this.errorMessage.set(
            'Demasiados intentos. Esperá una hora antes de volver a intentar.',
          );
        } else {
          this.errorMessage.set(
            err?.error?.message ??
              'No se pudo completar el registro. Revisá los datos e intentá de nuevo.',
          );
        }
      },
    });
  }
}
