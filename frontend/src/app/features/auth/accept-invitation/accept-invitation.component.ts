import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { InvitationPreview } from '../../../core/models/auth.model';

/**
 * SC-207 — `AcceptInvitationComponent`.
 *
 * Replaces the dead self-service `register()` flow (backend's
 * `POST /auth/register` is a 410 tombstone). Data flow, per
 * design.md:
 *
 *   ?token=... → ngOnInit → AuthService.previewInvitation(token)
 *     → 200: invitation.set(preview)   (org/inviter/role/expiry)
 *     → 404/410: errorMessage.set(...), no form shown
 *   → password form (minLength 12) → onSubmit
 *     → AuthService.acceptInvitation({ token, password })
 *     → 201: persistTokens() (via handleLoginSuccess) + navigate to
 *       /app/dashboard
 *     → 422: errorMessage + fieldErrors, no tokens stored
 *     → 404/410: errorMessage, no tokens stored
 *
 * Route has NO guestGuard (see app.routes.ts) — an already
 * authenticated user can land here to join a different
 * organization. ngOnInit clears any existing session BEFORE calling
 * previewInvitation, so a stale session never leaks into the new
 * accept-invitation call.
 */
@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './accept-invitation.component.html',
  styleUrl: './accept-invitation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcceptInvitationComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  readonly form: FormGroup;
  readonly invitation = signal<InvitationPreview | null>(null);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string[]>>({});
  readonly submitted = signal(false);

  private token: string | null = null;

  constructor() {
    this.form = this.formBuilder.group({
      password: ['', [Validators.required, Validators.minLength(12)]],
    });
  }

  get f() {
    return this.form.controls;
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');

    if (!this.token) {
      this.errorMessage.set('No se proporcionó un token de invitación.');
      return;
    }

    // Already-authenticated users can still land here (no guestGuard)
    // to join a different organization — clear their old session
    // before fetching the new invitation's preview.
    if (this.authService.isAuthenticated()) {
      this.authService.clearSession();
    }

    this.loading.set(true);
    this.authService.previewInvitation(this.token).subscribe({
      next: (preview) => {
        this.invitation.set(preview);
        this.loading.set(false);
      },
      error: (err: { status?: number; message?: string }) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapErrorMessage(err, 'No se pudo cargar la invitación.'));
      },
    });
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set({});

    if (this.form.invalid || !this.token) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    this.authService
      .acceptInvitation({ token: this.token, password: this.form.value.password })
      .subscribe({
        next: () => {
          this.loading.set(false);
          // Auto-login: the backend minted a session, navigate
          // straight to the app shell.
          this.router.navigate(['/app/dashboard']);
        },
        error: (err: { status?: number; message?: string; errors?: Record<string, string[]> }) => {
          this.loading.set(false);
          this.submitted.set(false);
          if (err.status === 422 && err.errors) {
            this.fieldErrors.set(err.errors);
            this.errorMessage.set('Revisá los campos marcados.');
            return;
          }
          this.errorMessage.set(this.mapErrorMessage(err, 'No se pudo aceptar la invitación.'));
        },
      });
  }

  private mapErrorMessage(err: { status?: number; message?: string }, fallback: string): string {
    if (err.status === 404) {
      return 'Invitación no encontrada.';
    }
    if (err.status === 410) {
      return 'La invitación expiró o ya fue utilizada.';
    }
    return err.message ?? fallback;
  }
}
