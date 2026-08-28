import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
// Import updated AuthService
import { AuthService } from '../../../core/services/auth.service';
import {
  fadeAnimation,
  slideUpAnimation,
  staggerFormElements,
} from '../../../core/animations/route.animations';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
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

        const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/app/dashboard';
        this.router.navigate([returnUrl]);
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
