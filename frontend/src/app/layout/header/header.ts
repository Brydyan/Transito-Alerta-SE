import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LayoutService } from '../../core/services/layout.service';

@Component({
  selector: 'app-header',
  imports: [RouterModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class Header {
  readonly authService = inject(AuthService);
  readonly layoutService = inject(LayoutService);
  readonly router = inject(Router);
  readonly userDropdownOpen = signal(false);

  toggleSidebar(): void {
    this.layoutService.toggleSidebar();
  }

  toggleUserDropdown(): void {
    this.userDropdownOpen.update((value) => !value);
  }

  closeUserDropdown(): void {
    this.userDropdownOpen.set(false);
  }

  logout(): void {
    this.closeUserDropdown();
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login']),
    });
  }

  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const dropdown = target.closest('.dropdown');

    if (!dropdown && this.userDropdownOpen()) {
      this.closeUserDropdown();
    }
  }
}
