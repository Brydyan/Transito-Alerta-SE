import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmDialogService } from './confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css',
})
export class ConfirmDialogComponent {
  private readonly dialogService = inject(ConfirmDialogService);
  readonly config = this.dialogService.activeDialog;

  onCancel(): void {
    this.dialogService.reject();
  }

  onConfirm(): void {
    this.dialogService.approve();
  }
}
