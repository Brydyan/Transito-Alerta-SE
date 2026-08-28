import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-table-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="overflow-x-auto w-full">
      <table class="w-full text-left align-middle mb-0 skeleton-table">
        @if (showHeaders()) {
          <thead>
            <tr>
              @for (col of colsArray(); track $index) {
                <th [class.pl-6]="$first" [class.pr-6]="$last" class="py-3">
                  <div
                    class="skeleton-shimmer skeleton-header"
                    [style.width]="getHeaderWidth($index)"
                  ></div>
                </th>
              }
            </tr>
          </thead>
        }
        <tbody>
          @for (row of rowsArray(); track $index) {
            <tr>
              @for (col of colsArray(); track $index) {
                <td [class.pl-6]="$first" [class.pr-6]="$last" class="py-4">
                  <div
                    class="skeleton-shimmer skeleton-cell"
                    [style.width]="getCellWidth($index)"
                  ></div>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .skeleton-table {
        border-collapse: separate;
        border-spacing: 0;
      }

      .skeleton-shimmer {
        background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 6px;
      }

      .skeleton-header {
        height: 14px;
      }

      .skeleton-cell {
        height: 18px;
      }

      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableSkeletonComponent {
  readonly rows = input<number>(5);
  readonly cols = input<number>(6);
  readonly showHeaders = input<boolean>(true);

  colsArray(): number[] {
    return Array.from({ length: this.cols() }, (_, i) => i);
  }

  rowsArray(): number[] {
    return Array.from({ length: this.rows() }, (_, i) => i);
  }

  getHeaderWidth(index: number): string {
    const widths = ['40%', '65%', '50%', '70%', '60%', '45%', '55%', '50%'];
    return widths[index % widths.length];
  }

  getCellWidth(index: number): string {
    const widths = ['55%', '85%', '60%', '75%', '65%', '50%', '70%', '40%'];
    return widths[index % widths.length];
  }
}
