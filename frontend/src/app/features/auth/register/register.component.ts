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

  constructor() {
    this.registerForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      // MAIL E.1 (ronda 14, D7) — segundo campo de
      // confirmación. Defiende contra el dedazo humano: si
      // el visitante tecleó mal su propio correo, el OTP
      // viaja a un buzón que no es el suyo y la cuenta
      // queda inservible (o el aviso, peor, va a un
      // desconocido).
      //
      // El campo NO viaja al servidor (ver F.1/E.4). El
      // `ValidationPipe` del backend corre con
      // `forbidNonWhitelisted` y rechaza el alta entera si
      // llega una propiedad de más.
      email_confirm: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
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
    },
    // MAIL E.2 (ronda 14, D7) — validador de GRUPO que
    // compara `email` con `email_confirm`. Es de grupo, no
    // de campo: un validador de campo no ve el valor del
    // otro. Y si se engancha sólo al segundo, editar el
    // primero después de confirmar deja el formulario
    // válido con dos valores distintos.
    { validators: this.emailMatchValidator },
    );
  }

  /**
   * Comparación `email` vs `email_confirm` a nivel de grupo.
   * Devuelve `{ emailMatch: true }` cuando los valores
   * coinciden (o cuando el formulario todavía no tiene uno
   * de los dos — la validación por campo, que corre antes,
   * se encarga de marcar el requerido).
   */
  private readonly emailMatchValidator = (group: FormGroup) => {
    const email = group.get('email')?.value as string | null;
    const confirm = group.get('email_confirm')?.value as string | null;
    if (!email || !confirm) {
      return null;
    }
    return email === confirm ? null : { emailMatch: true };
  };

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
      next: (response) => {
        this.loading.set(false);
        // D3 — siempre navegamos al verify-email. El backend
        // ya mandó el OTP (o el aviso al titular si el correo
        // existía); cualquiera de los dos caminos aterriza acá.
        //
        // F.1 (ronda 14) — el `hint` que muestra la pantalla
        // de verificación es el MISMO string que devolvió el
        // backend en la respuesta del alta (`publicMessage`).
        // Antes había una constante local con la frase «Si
        // ya lo estaba, te avisamos al titular», que REG
        // quitó del backend en su ronda 12 — y el frontend
        // quedó mostrando una frase muerta. La única fuente
        // de la copia es el backend.
        this.router.navigate(['/verify-email'], {
          queryParams: { email, hint: response.message },
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
