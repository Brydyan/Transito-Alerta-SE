import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
// Import updated AuthService
import { AuthService } from '../../../core/services/auth.service';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';
import {
  fadeAnimation,
  slideUpAnimation,
  staggerFormElements,
} from '../../../core/animations/route.animations';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, UiIconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  animations: [fadeAnimation, slideUpAnimation, staggerFormElements],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  readonly loginForm: FormGroup;
  readonly submitted = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  // 2026-10-16-password-visibility-toggle — toggle que cambia
  // `type="password"` ↔ `type="text"` en el input. Default false
  // (oculto) — el standard de la industria es no mostrar la
  // contraseña por defecto, especialmente en pantallas públicas.
  readonly showPassword = signal(false);

  /** 2026-10-16 — flip del `showPassword`. */
  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  constructor() {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  get f() {
    return this.loginForm.controls;
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.errorMessage.set(null);

    if (this.loginForm.invalid) {
      return;
    }

    this.loading.set(true);

    this.authService.login(this.loginForm.value).subscribe({
      // Usamos () si no necesitamos el objeto response, evitando el error de lint
      next: () => {
        this.loading.set(false);

        // REG (sc-325) C.4 — la regla de redirección vive en
        // un solo lugar. Si el usuario es `reporter` y su
        // correo no está verificado, va al composer del OTP
        // (sin buscarla). El personal entra al dashboard como
        // siempre — la verificación no les aplica. Si la
        // decisión se duplicara entre este componente y un
        // guard de ruta, una de las dos copias se quedaría
        // vieja (el defecto recurrente del proyecto).
        //
        // `fetchUser()` ya corrió en `handleLoginSuccess`
        // (AuthService). El signal `user` está sincronizado.
        const current = this.authService.user();
        if (
          current?.roleName === 'reporter' &&
          current.emailVerified === false
        ) {
          this.router.navigate(['/verificar']);
          return;
        }

        const returnUrl = this.route.snapshot.queryParams['returnUrl'];
        // 2026-10-19-post-login-redirect-by-role — el `reporter`
        // no tiene el permiso `READ dashboard` (su menú llega a
        // `/app/inicio` y `/app/reportar`), así que mandarlo al
        // dashboard por defecto lo estrella contra el guard nuevo
        // y termina en errores `403 Forbidden` por
        // `/api/incident-categories` y compañía. El personal
        // (cualquier otro rol) sigue cayendo al dashboard como
        // antes. Si viene `returnUrl` en la query, respetamos la
        // intención del visitante — el guard de la ruta de
        // destino decidirá si tiene permiso.
        const roleBasedDefault =
          current?.roleName === 'reporter' ? '/app/inicio' : '/app/dashboard';
        this.router.navigate([returnUrl ?? roleBasedDefault]);
      },
      error: (error: Error) => {
        console.error('Error en login:', error);
        this.errorMessage.set(error.message || 'Error al iniciar sesión');
        this.loading.set(false);
        this.submitted.set(false);
      },
    });
  }
}
