import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from './toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.css',
})
export class ToastComponent {
  private readonly toastService = inject(ToastService);
  readonly toasts = this.toastService.toasts;

  removeToast(id: number): void {
    this.toastService.remove(id);
  }

  getIconClass(type: Toast['type']): string {
    const icons: Record<Toast['type'], string> = {
      success: 'bi-check-lg',
      error: 'bi-x-lg',
      warning: 'bi-exclamation-lg',
      info: 'bi-info-lg',
    };
    return icons[type] || 'bi-info-lg';
  }
}
