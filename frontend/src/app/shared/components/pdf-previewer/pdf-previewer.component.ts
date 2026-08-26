import { Component, input } from '@angular/core';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pdf-previewer',
  standalone: true,
  imports: [CommonModule, NgxExtendedPdfViewerModule],
  template: `
    <div class="w-full border border-border-color rounded-md overflow-hidden">
      @if (base64Src()) {
        <ngx-extended-pdf-viewer
          [base64Src]="base64Src()!"
          [height]="height()"
          [textLayer]="true"
          [showHandToolButton]="true"
        ></ngx-extended-pdf-viewer>
      }
      @if (src() && !base64Src()) {
        <ngx-extended-pdf-viewer
          [src]="src()!"
          [height]="height()"
          [textLayer]="true"
          [showHandToolButton]="true"
        ></ngx-extended-pdf-viewer>
      }
    </div>
    @if (!src() && !base64Src()) {
      <div class="p-4 mb-4 text-sky-800 bg-sky-100 border border-sky-200 rounded-lg">Esperando documento para previsualización...</div>
    }
  `,
  styles: [
    `
      .pdf-container {
        width: 100%;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        overflow: hidden;
      }
    `,
  ],
})
export class PdfPreviewerComponent {
  readonly src = input<Blob | string | Uint8Array | undefined>(undefined);
  readonly base64Src = input<string | undefined>(undefined);
  readonly height = input('700px');
}
