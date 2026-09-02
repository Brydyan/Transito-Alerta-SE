import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BreadcrumbService } from '../../../core/services/breadcrumb.service';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

@Component({
  selector: 'app-breadcrumb',
  imports: [CommonModule, RouterModule, UiIconComponent],
  templateUrl: './breadcrumb.component.html',
  styleUrl: './breadcrumb.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreadcrumbComponent {
  readonly breadcrumbService = inject(BreadcrumbService);
}
