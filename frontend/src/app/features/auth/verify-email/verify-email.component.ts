import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { UiCardComponent } from '../../../shared/components/ui-card/ui-card.component';

/**
 * REG (sc-325) — verify-email landing page.
 *
 * R6: `register.component.ts:onSubmit` navega a esta ruta con
 * `email` en query params. Es la **primera ruta del alta pública**
 * que muestra el contrato con el correo: «te enviamos un mensaje
 * para verificar tu cuenta. Si ya estaba registrada, te avisamos
 * al titular.» — el mensaje no revela cuál de los dos casos se
 * aplicó (D3, indistinguibilidad).
 *
 * **Por qué no llama directamente a `POST /api/email/resend-verification`
 * desde acá**: el endpoint exige JWT (T6.5.D, `email-verification.controller.ts:43`).
 * El alta pública no emite tokens (sólo crea la cuenta), así que
 * cuando el ciudadano llega a esta página está sin sesión.
 * La pantalla lo lleva a `/login` con el correo pre-rellenado;
 * tras autenticarse, lo devolvemos a `/verify-email` con la sesión
 * viva, y entonces el composer del OTP (que es lo que el `.js`
 * heredado de sc-117 hacía) entra en juego. Esa parte vive en F4
 * — el camino de hoy cumple el contrato del spec y deja la pieza
 * de F4 con un punto claro donde enchufar.
 */
@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, UiCardComponent],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  /** Correo pre-rellenado desde el query param `?email=...`. */
  readonly emailForm: FormGroup<{ email: FormControl<string> }> = this.fb.group({
    email: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.email,
    ]),
  });

  get emailCtrl(): FormControl<string> {
    return this.emailForm.controls.email;
  }

  /** Mensaje estándar de D3 (indistinguible: nuevo o existente). */
  readonly hint = signal<string>('');

  /** F3.1.1 — el path `/verify-email` existe en `app.routes.ts`. */
  readonly isAuthenticated = signal<boolean>(false);

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const email = qp.get('email') ?? '';
    this.emailCtrl.setValue(email);
    this.hint.set(
      qp.get('hint') ??
        'Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta. Si ya lo estaba, te avisamos al titular.',
    );
    this.isAuthenticated.set(this.authService.isAuthenticated());
  }

  /** Lleva al login con el correo pre-rellenado; tras autenticarse,
   *  el guard de login redirige al dashboard — el composer del OTP
   *  entra cuando F4 lo enchufe. */
  goToLogin(): void {
    this.router.navigate(['/login'], {
      queryParams: { email: this.emailCtrl.value || null },
    });
  }
}
