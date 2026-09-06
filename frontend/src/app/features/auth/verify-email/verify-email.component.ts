import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { UiCardComponent } from '../../../shared/components/ui-card/ui-card.component';

/**
 * REG (sc-325) — verify-email landing page (público).
 *
 * R6: `register.component.ts:onSubmit` navega a esta ruta con
 * `email` en query params. Es la **primera ruta del alta pública**
 * que muestra el contrato con el correo: «te enviamos un mensaje
 * para verificar tu cuenta. Si ya estaba registrada, te avisamos
 * al titular.» — el mensaje no revela cuál de los dos casos se
 * aplicó (D3, indistinguibilidad).
 *
 * **C.5 (ronda 9)**: el composer del OTP se mudó a `/verificar`
 * con `authGuard` (no a F4 como decía el round 0). Esta página
 * pública sigue siendo el destino tras el alta, pero ya no es
 * un callejón: enlaza a `/login` explicando que hay que entrar
 * para poder ingresar el código. La razón: el backend exige
 * JWT para los endpoints del composer (T6.5.D).
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

  /** Lleva al login con el correo pre-rellenado. El composer del OTP
   *  vive en `/verificar` (C.3) y el `LoginComponent` (C.4) lo
   *  alcanza automáticamente para el `reporter` sin verificar. */
  goToLogin(): void {
    this.router.navigate(['/login'], {
      queryParams: { email: this.emailCtrl.value || null },
    });
  }
}
