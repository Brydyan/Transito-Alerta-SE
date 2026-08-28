import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formatea fechas parseando SIEMPRE los strings `YYYY-MM-DD` como
 * componentes locales (año/mes/día en la zona horaria del navegador),
 * NO como `new Date('YYYY-MM-DD')` que el estándar JS interpreta como
 * UTC midnight y produce un shift de un día en zonas con offset negativo.
 *
 * El backend emite date-only strings en formato `YYYY-MM-DD` desde
 * `DateUtil.formatForFrontend`. Usar este pipe en lugar del `| date:`
 * de Angular evita el bug de UTC-shift en países como Argentina (UTC-3).
 *
 * Uso:
 *   {{ fechaPlanificada | localDate:'dd/MM/yyyy' }}
 *   {{ lectura.fecha | localDate:'dd/MM/yyyy HH:mm' }}
 *
 * Tokens soportados (case-sensitive):
 *   - `dd`   → día con dos dígitos
 *   - `MM`   → mes con dos dígitos
 *   - `yyyy` → año con cuatro dígitos
 *   - `HH`   → hora con dos dígitos (0-23)
 *   - `mm`   → minutos con dos dígitos
 *
 * Formato por defecto: `dd/MM/yyyy`.
 *
 * Devuelve string vacío (`''`) para valores null/undefined/ inválidos —
 * el caller decide si renderizar un placeholder (`—`) en la plantilla.
 */
@Pipe({
  name: 'localDate',
  standalone: true,
})
export class LocalDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, format = 'dd/MM/yyyy'): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    const date = this.toDate(value);
    if (!date) {
      return '';
    }

    return this.formatDate(date, format);
  }

  /**
   * Convierte el input a Date. Acepta ESTRICTAMENTE:
   *   - Date objects
   *   - String `YYYY-MM-DD` (con zero-padding en mes/día) → LOCAL
   *   - String ISO con tiempo `YYYY-MM-DDTHH:mm:ss[.sss][±HH:mm|Z]`
   *
   * Devuelve null para cualquier otro formato. NO se cae al parser nativo
   * genérico de JS porque acepta formatos ambiguos (`'2026-8-20'`,
   * `'Aug 20, 2026'`, etc.) y queremos que el pipe sea predecible: si el
   * backend o el caller mandan un formato distinto, fallamos explícito.
   */
  private toDate(value: string | Date): Date | null {
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    // 1) Date-only `YYYY-MM-DD` (zero-padded) → LOCAL
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      const local = new Date(Number(year), Number(month) - 1, Number(day));
      return isNaN(local.getTime()) ? null : local;
    }

    // 2) ISO con tiempo: `YYYY-MM-DDTHH:mm:ss[.sss][±HH:mm|Z]`
    const isoWithTimeMatch =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(
        value,
      );
    if (isoWithTimeMatch) {
      const isoDate = new Date(value);
      if (!isNaN(isoDate.getTime())) {
        return isoDate;
      }
    }

    return null;
  }

  private formatDate(date: Date, format: string): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    // Reemplazar tokens longest-first para evitar pisar `mm` (minutos) con `MM` (mes).
    // Como `MM` y `mm` son case-sensitive y Angular usa la misma convención, los
    // tratamos como case-sensitive también.
    return format
      .replace(/yyyy/g, year)
      .replace(/MM/g, month)
      .replace(/dd/g, day)
      .replace(/HH/g, hours)
      .replace(/mm/g, minutes);
  }
}
