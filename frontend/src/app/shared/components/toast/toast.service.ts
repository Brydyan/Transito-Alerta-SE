import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  title?: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 0;

  show(message: string, type: Toast['type'] = 'info', title?: string, duration = 4000): void {
    const id = this.nextId++;
    const newToast: Toast = { id, message, type, title, duration };
    this.toasts.update((current) => [...current, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }
  }

  success(message: string, title?: string, duration?: number): void {
    this.show(message, 'success', title, duration);
  }

  error(message: string, title?: string, duration?: number): void {
    this.show(message, 'error', title, duration);
  }

  warning(message: string, title?: string, duration?: number): void {
    this.show(message, 'warning', title, duration);
  }

  info(message: string, title?: string, duration?: number): void {
    this.show(message, 'info', title, duration);
  }

  remove(id: number): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }
}
