import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

import { ClickOutsideDirective } from '../../directives/click-outside.directive';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [ClickOutsideDirective],
  templateUrl: './date-picker.component.html',
  styleUrl: './date-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatePickerComponent {
  private readonly elementRef = inject(ElementRef);

  readonly value = input<string>('');
  readonly placeholder = input('Seleccione una fecha');
  readonly inputId = input<string>('');
  readonly disabled = input(false);

  readonly valueChange = output<string>();

  readonly isOpen = signal(false);
  readonly openUpwards = signal(false);
  readonly viewDate = signal(new Date());

  // Semana arranca en Lunes: JS devuelve 0=Dom ... 6=Sáb
  readonly diasSemana = DIAS_SEMANA;

  readonly viewLabel = computed(() => {
    const d = this.viewDate();
    return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
  });

  readonly celdas = computed(() => {
    const view = this.viewDate();
    const year = view.getFullYear();
    const month = view.getMonth();

    const firstDay = new Date(year, month, 1);
    // offset: Lunes=0 ... Domingo=6
    const offset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(new Date(year, month, day));
    }
    return cells;
  });

  constructor() {
    // Al abrir, sincronizar el mes visible con el valor actual (si existe)
    effect(() => {
      if (this.isOpen()) {
        const val = this.value();
        if (val) {
          const [y, m] = val.split('-').map(Number);
          if (y && m) {
            this.viewDate.set(new Date(y, m - 1, 1));
          }
        }
      }
    });
  }

  toggle(): void {
    if (!this.isOpen()) {
      this.checkPlacement();
      this.isOpen.set(true);
    } else {
      this.isOpen.set(false);
    }
  }

  private checkPlacement(): void {
    const el = this.elementRef.nativeElement as HTMLElement;
    const rect = el.getBoundingClientRect();
    const popoverHeight = 310; // Alto aproximado del popover de calendario
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Si no hay suficiente espacio abajo (menos de 310px) y arriba hay más espacio, abrir hacia arriba
    if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
      this.openUpwards.set(true);
    } else {
      this.openUpwards.set(false);
    }
  }

  close(): void {
    this.isOpen.set(false);
  }

  // Cierra el calendario con la tecla Escape
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isOpen.set(false);
  }

  prevMonth(): void {
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  nextMonth(): void {
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  isToday(day: Date): boolean {
    const now = new Date();
    return (
      day.getFullYear() === now.getFullYear() &&
      day.getMonth() === now.getMonth() &&
      day.getDate() === now.getDate()
    );
  }

  isSelected(day: Date): boolean {
    return this.toIso(day) === this.value();
  }

  select(day: Date): void {
    this.valueChange.emit(this.toIso(day));
    this.isOpen.set(false);
  }

  private toIso(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
