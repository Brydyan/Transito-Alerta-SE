import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpService } from '../../../core/services/http.service';
import { AuthService } from '../../../core/services/auth.service';
import { UiCardComponent } from '../../../shared/components/ui-card/ui-card.component';

/**
 * REG (sc-325) — Composer del OTP (C.3).
 *
 * Pantalla detrás de `authGuard`. El `reporter` llega acá
 * automáticamente tras el login (C.4) si `email_verified === false`.
 * El personal (staff) nunca entra: la regla vive en un solo
 * lugar — `LoginComponent` consulta `email_verified` antes de
 * decidir a dónde mandar.
 *
 * **Códigos del backend y su UX** (ver `email-verification.controller.ts:21-50`):
 *  - **200** `verified: true` → llamar a `AuthService.fetchUser()`
 *    para refrescar el signal `emailVerified` y navegar al destino.
 *  - **422** código inválido o vencido, O correo ya verificado.
 *    Dos causas distintas: el spec pide distinguirlas.
 *    `code` identifica cuál: `OTP_INVALID` vs `EMAIL_ALREADY_VERIFIED`.
 *  - **429** reenvío dentro de los 60 s ⇒ mensaje neutral
 *    («esperá un minuto»). NO es un fallo; el `resend-verification`
 *    está bien.
 *  - **401** sin token ⇒ el `authGuard` ya redirige a `/login`
 *    antes de llegar acá.
 *
 * El `message` del 422 puede incluir `code` (NestJS devuelve
 * `{ message, code, statusCode }` por convención del proyecto).
 * El componente distingue los dos casos por `code` y muestra
 * el texto accionable correspondiente.
 */
@Component({
  selector: 'app-verify-otp',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, UiCardComponent],
  templateUrl: './verify-otp.component.html',
  styleUrl: './verify-otp.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyOtpComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly httpService = inject(HttpService);
  private readonly authService = inject(AuthService);
  // REG (sc-325) Fix C (ronda 10) — el componente navegaba al
  // dashboard tras 200 / `already`, pero el `Router` nunca se
  // inyectaba. Los mensajes "Redirigiendo…" y "Volvemos a tu
  // cuenta…" eran falsos — el usuario se quedaba parado en
  // `/verificar` con la promesa de una navegación que no
  // ocurría. CRITICAL 3 del verify de la ronda 9.
  private readonly router = inject(Router);
  // Si el `LoginComponent` (C.4) nos trajo con un `returnUrl`,
  // lo respetamos; si no, vamos al dashboard. Acá leemos la
  // query param en `ngOnInit` (no en el `submit`, porque la
  // query param no cambia entre el mount y el submit).
  private readonly route = inject(ActivatedRoute);

  /** Destino post-verificación. Default: `/app/dashboard`. */
  private returnUrl: string = '/app/dashboard';

  readonly otpForm: FormGroup<{ otp: FormControl<string> }> = this.fb.group({
    otp: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(6),
      Validators.maxLength(6),
      Validators.pattern(/^\d{6}$/),
    ]),
  });

  /** Estados del composer. `idle` cuando no hay request en curso. */
  readonly status = signal<
    'idle' | 'verifying' | 'resending' | 'resent-ok' | 'success' | 'invalid' | 'already' | 'ratelimit'
  >('idle');

  /** Mensaje accionable para el usuario. */
  readonly message = signal<string | null>(null);

  /** Códigos del backend que este componente distingue. */
  private static readonly CODE_OTP_INVALID = 'OTP_INVALID';
  private static readonly CODE_ALREADY_VERIFIED = 'EMAIL_ALREADY_VERIFIED';

  ngOnInit(): void {
    // El form arranca vacío. El composer no pre-rellena: el OTP
    // es del correo que el usuario tiene abierto, no del que
    // está en pantalla.
    const qpReturn = this.route.snapshot.queryParamMap.get('returnUrl');
    if (qpReturn && qpReturn.startsWith('/app/')) {
      this.returnUrl = qpReturn;
    }
  }

  get otpCtrl(): FormControl<string> {
    return this.otpForm.controls.otp;
  }

  async submit(): Promise<void> {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }
    this.status.set('verifying');
    this.message.set(null);
    const otp = this.otpCtrl.value.trim();

    try {
      await this.httpService
        .post<{ verified: boolean }>('/email/verify-otp', { otp })
        .toPromise();
      // 200 — `verified: true`. Refrescar el signal y avisar al
      // padre (login / dashboard) que ya pasó.
      this.status.set('success');
      this.message.set('Correo verificado. Redirigiendo…');
      await this.authService.fetchUser().toPromise();
      // REG Fix C (ronda 10) — el composer promete
      // "Redirigiendo…" y debe cumplir. Sin esta línea el
      // usuario se queda parado en `/verificar` con la
      // sensación de que la app se colgó. El destino es el
      // `returnUrl` (si el LoginComponent lo proveyó) o el
      // dashboard por defecto. Cumplir el contrato de
      // "no lo deja en un callejón" del spec.
      this.router.navigateByUrl(this.returnUrl);
    } catch (err: unknown) {
      const e = err as { status?: number; error?: { code?: string; message?: string } };
      if (e?.status === 422) {
        // Dos causas distintas, mismo código HTTP. Distinguimos
        // por `error.code` que el backend emite.
        if (e?.error?.code === VerifyOtpComponent.CODE_ALREADY_VERIFIED) {
          this.status.set('already');
          this.message.set(
            'Tu correo ya estaba verificado. Volvemos a tu cuenta…',
          );
          // REG Fix C (ronda 10) — mismo compromiso: "Volvemos
          // a tu cuenta…" no era una promesa hueca. Refrescamos
          // el signal para que `user.emailVerified` sea `true`
          // y luego navegamos.
          await this.authService.fetchUser().toPromise();
          this.router.navigateByUrl(this.returnUrl);
        } else {
          this.status.set('invalid');
          this.message.set(
            'El código no es válido o venció. Pedí uno nuevo y volvé a intentar.',
          );
        }
      } else if (e?.status === 429) {
        // No es un fallo: es «esperá un minuto». Presentar como
        // error rojo enseña a desconfiar de la pantalla, así que
        // el composer usa un tono neutral.
        this.status.set('ratelimit');
        this.message.set(
          'Te enviamos un código hace menos de un minuto. Esperá y probá de nuevo.',
        );
      } else {
        this.status.set('invalid');
        this.message.set(
          e?.error?.message ?? 'No se pudo verificar. Probá de nuevo.',
        );
      }
    }
  }

  async resend(): Promise<void> {
    this.status.set('resending');
    this.message.set(null);
    try {
      await this.httpService
        .post<{ queued: boolean }>('/email/resend-verification', {})
        .toPromise();
      this.status.set('resent-ok');
      this.message.set('Listo. Revisá tu casilla e ingresá el código nuevo.');
    } catch (err: unknown) {
      const e = err as { status?: number; error?: { message?: string } };
      if (e?.status === 429) {
        this.status.set('ratelimit');
        this.message.set(
          'Acabamos de enviarte uno. Esperá un minuto antes de pedir otro.',
        );
      } else {
        this.status.set('invalid');
        this.message.set(
          e?.error?.message ?? 'No se pudo reenviar. Probá de nuevo.',
        );
      }
    }
  }
}
