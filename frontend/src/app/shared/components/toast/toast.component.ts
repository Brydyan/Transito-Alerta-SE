import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from './toast.service';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.css',
})
export class ToastComponent {
  private readonly toastService = inject(ToastService);
  readonly toasts = this.toastService.toasts;

  removeToast(id: number): void {
    this.toastService.remove(id);
  }

  /** Nombre Lucide kebab-case por tipo de toast. */
  getIconName(type: Toast['type']): string {
    const icons: Record<Toast['type'], string> = {
      success: 'check-circle',
      error: 'alert-octagon',
      warning: 'alert-triangle',
      info: 'info',
    };
    return icons[type] ?? 'info';
  }
}
