import { Injectable, signal, TemplateRef } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpinnerService {
  // Cambiamos 'any' por 'unknown' para que el linter esté feliz y el código sea más seguro
  private readonly customLoading = signal<TemplateRef<unknown> | null>(null);
  private readonly loading = signal(false);
  private readonly activeRequests = signal(0);

  // Exponemos como Readonly para seguir las buenas prácticas de Signals
  readonly customSpinner = this.customLoading.asReadonly();
  readonly spinner = this.loading.asReadonly();

  private showTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly showDelayMs = 300;

  loadingOn(customLoader?: TemplateRef<unknown>): void {
    if (customLoader) {
      this.customLoading.set(customLoader);
    }

    const current = this.activeRequests();
    this.activeRequests.set(current + 1);

    if (current === 0 && !this.showTimeoutId) {
      this.showTimeoutId = setTimeout(() => {
        this.showTimeoutId = null;
        if (this.activeRequests() > 0) {
          this.loading.set(true);
        }
      }, this.showDelayMs);
    }
  }

  loadingOff(): void {
    const newCount = Math.max(0, this.activeRequests() - 1);
    this.activeRequests.set(newCount);

    if (newCount === 0) {
      if (this.showTimeoutId) {
        clearTimeout(this.showTimeoutId);
        this.showTimeoutId = null;
      }
      this.loading.set(false);
      this.customLoading.set(null);
    }
  }
}
