import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { PdfPreviewerComponent } from '../../../shared/components/pdf-previewer/pdf-previewer.component';
import { DatePickerComponent } from '../../../shared/components/date-picker/date-picker.component';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { IClientsListFilters, ISendClientsListEmailBody } from '../interfaces/ireport.interface';
import { ReportsService } from '../services/reports.service';

type DatePreset = 'currentYear' | 'currentMonth' | 'lastMonth' | 'last3Months';

@Component({
  selector: 'app-clients-list',
  standalone: true,
  imports: [FormsModule, PdfPreviewerComponent, DatePickerComponent],
  templateUrl: './clients-list.html',
  styleUrl: './clients-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientsListComponent implements OnInit {
  private readonly reportsService = inject(ReportsService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  // Filtros del listado de clientes
  readonly fechaDesde = signal('');
  readonly fechaHasta = signal('');
  readonly activo = signal('');

  // Resultados
  readonly pdfBlob = signal<Blob | null>(null);
  readonly isLoadingPdf = signal(false);

  // Envío por email (modal)
  readonly destinatario = signal('');
  readonly subject = signal('');
  readonly isSendingEmail = signal(false);
  readonly isEmailModalOpen = signal(false);

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      this.fechaDesde.set(params['fechaDesde'] ?? '');
      this.fechaHasta.set(params['fechaHasta'] ?? '');
      this.activo.set(params['activo'] ?? '');
    });
  }

  // Validación cruzada de fechas: desde no puede ser mayor que hasta
  readonly rangoFechaInvalido = computed(
    () => !!this.fechaDesde() && !!this.fechaHasta() && this.fechaDesde() > this.fechaHasta(),
  );

  // Email de destino inválido (vacío o con formato incorrecto)
  readonly esEmailInvalido = computed(() => {
    const email = this.destinatario().trim();
    return email === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  });

  private buildFilters(): IClientsListFilters {
    const filters: IClientsListFilters = {};

    const desde = this.fechaDesde();
    const hasta = this.fechaHasta();
    const activo = this.activo();

    if (desde) filters.fechaDesde = desde;
    if (hasta) filters.fechaHasta = hasta;
    if (activo) filters.activo = activo === 'true';
    return filters;
  }

  // ---------- Presets rápidos de rango de fechas ----------

  aplicarPreset(preset: DatePreset): void {
    const hoy = new Date();
    const desde = new Date(hoy);
    const hasta = new Date(hoy);

    switch (preset) {
      case 'currentYear':
        desde.setMonth(0, 1);
        break;
      case 'currentMonth':
        desde.setDate(1);
        break;
      case 'lastMonth':
        desde.setMonth(desde.getMonth() - 1, 1);
        hasta.setDate(0);
        break;
      case 'last3Months':
        desde.setMonth(desde.getMonth() - 3);
        break;
    }

    this.fechaDesde.set(this.toIsoDate(desde));
    this.fechaHasta.set(this.toIsoDate(hasta));
  }

  private toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ---------- Generar PDF ----------

  generarPdf(): void {
    if (this.rangoFechaInvalido()) return;

    this.isLoadingPdf.set(true);
    this.reportsService.getClientsListPdf(this.buildFilters()).subscribe({
      next: (blob) => {
        this.pdfBlob.set(blob);
        this.isLoadingPdf.set(false);
        this.toast.success('PDF generado correctamente', 'Éxito');
      },
      error: (err) => {
        this.isLoadingPdf.set(false);
        this.toast.error(
          this.getErrorMessage(err, 'No se pudo generar el PDF del reporte'),
          'Error',
        );
      },
    });
  }

  // ---------- Descargar PDF ----------

  descargarPdf(): void {
    const blob = this.pdfBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = `listado-clientes-${this.activo() || 'todos'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Envío por email (modal) ----------

  abrirModalEmail(): void {
    this.isEmailModalOpen.set(true);
  }

  cerrarModalEmail(): void {
    if (this.isSendingEmail()) {
      return;
    }
    this.isEmailModalOpen.set(false);
  }

  enviarEmail(): void {
    const destinatario = this.destinatario().trim();
    if (!destinatario) {
      this.toast.error('El destinatario es obligatorio para enviar el reporte', 'Error');
      return;
    }

    const body: ISendClientsListEmailBody = {
      destinatario,
      subject: this.subject().trim() || undefined,
      filtros: this.buildFilters(),
    };

    this.isSendingEmail.set(true);
    this.reportsService.sendClientsListEmail(body).subscribe({
      next: () => {
        this.isSendingEmail.set(false);
        this.isEmailModalOpen.set(false);
        this.destinatario.set('');
        this.subject.set('');
        this.toast.success('Reporte enviado por email', 'Éxito');
      },
      error: (err) => {
        this.isSendingEmail.set(false);
        this.toast.error(
          this.getErrorMessage(err, 'No se pudo enviar el reporte por email'),
          'Error',
        );
      },
    });
  }

  limpiar(): void {
    this.fechaDesde.set('');
    this.fechaHasta.set('');
    this.activo.set('');
    this.pdfBlob.set(null);
    this.destinatario.set('');
    this.subject.set('');
  }

  private getErrorMessage(err: unknown, fallback: string): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const inner = (err as { error?: unknown }).error;
      if (inner && typeof inner === 'object' && 'message' in inner) {
        const message = (inner as { message?: unknown }).message;
        if (typeof message === 'string' && message) {
          return message;
        }
      }
    }
    return fallback;
  }
}
