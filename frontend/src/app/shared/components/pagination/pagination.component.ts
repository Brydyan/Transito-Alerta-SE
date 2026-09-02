import { Component, computed, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginationComponent {
  // Inputs
  totalItems = input<number>(0);
  currentPage = input<number>(1);
  pageSize = input<number>(10);
  pageSizeOptions = input<number[]>([5, 10, 15, 20]);
  itemNameSingular = input<string>('registro');
  itemNamePlural = input<string>('registros');
  showPageSize = input<boolean>(true);
  showTotal = input<boolean>(true);
  showRange = input<boolean>(true);

  // Outputs
  pageChange = output<number>();
  pageSizeChange = output<number>();

  // Computed properties
  totalPages = computed(() => {
    const total = this.totalItems();
    const size = this.pageSize();
    return Math.max(1, Math.ceil(total / size));
  });

  startRange = computed(() => {
    if (this.totalItems() === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });

  endRange = computed(() => {
    return Math.min(this.currentPage() * this.pageSize(), this.totalItems());
  });

  pages = computed<(number | '...')[]>(() => {
    const current = this.currentPage();
    const total = this.totalPages();
    const range = 2; // number of pages to show around active page

    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages: (number | '...')[] = [];

    // Always show the first page
    pages.push(1);

    if (current > 3 + 1) {
      pages.push('...');
    }

    const start = Math.max(2, current - range);
    const end = Math.min(total - 1, current + range);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (current < total - 3) {
      pages.push('...');
    }

    // Always show the last page
    pages.push(total);

    return pages;
  });

  // Handlers
  onPageClick(page: number | '...', event: Event) {
    event.preventDefault();
    if (page === '...') return;
    if (page === this.currentPage()) return;
    this.pageChange.emit(page);
  }

  onPrevious(event: Event) {
    event.preventDefault();
    if (this.currentPage() > 1) {
      this.pageChange.emit(this.currentPage() - 1);
    }
  }

  onNext(event: Event) {
    event.preventDefault();
    if (this.currentPage() < this.totalPages()) {
      this.pageChange.emit(this.currentPage() + 1);
    }
  }

  onPageSizeChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    if (select) {
      this.pageSizeChange.emit(Number(select.value));
    }
  }
}
