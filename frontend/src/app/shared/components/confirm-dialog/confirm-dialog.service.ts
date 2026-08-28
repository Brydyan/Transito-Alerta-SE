import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface ConfirmDialogConfig {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmDialogService {
  readonly activeDialog = signal<ConfirmDialogConfig | null>(null);
  private response$ = new Subject<boolean>();

  confirm(config: ConfirmDialogConfig): Subject<boolean> {
    this.activeDialog.set(config);
    this.response$ = new Subject<boolean>();
    return this.response$;
  }

  approve(): void {
    this.activeDialog.set(null);
    this.response$.next(true);
    this.response$.complete();
  }

  reject(): void {
    this.activeDialog.set(null);
    this.response$.next(false);
    this.response$.complete();
  }
}
