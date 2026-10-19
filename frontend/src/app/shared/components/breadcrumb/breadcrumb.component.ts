import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BreadcrumbService } from '../../../core/services/breadcrumb.service';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-breadcrumb',
  imports: [CommonModule, RouterModule, UiIconComponent],
  templateUrl: './breadcrumb.component.html',
  styleUrl: './breadcrumb.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreadcrumbComponent {
  readonly breadcrumbService = inject(BreadcrumbService);
  private readonly authService = inject(AuthService);

  // 2026-10-19-dashboard-permission-gate — el icono "home" del
  // breadcrumb llevaba a `/app/dashboard`, que el `reporter` no
  // puede ver. Si lo cliquea, el guard lo rebota y entra en
  // loop. Misma regla unificada: `reporter` → `/app/inicio`,
  // staff → `/app/dashboard`.
  readonly homeRoute = computed(() =>
    this.authService.user()?.roleName === 'reporter'
      ? '/app/inicio'
      : '/app/dashboard',
  );
}
