import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { UiIconComponent } from '../../../../../shared/components/ui-icon/ui-icon.component';

/**
 * SearchBar con debounce — F6 (`2026-09-08-f6-usuarios-redesign`).
 *
 * Recibe `placeholder` y emite `searchChange` después de 300 ms
 * de inactividad. La búsqueda es **local** sobre los datos ya
 * cargados (decisión de diseño: «Instant feedback, no server
 * overhead»). El botón X limpia la entrada y emite `''` para
 * que el padre re-renderice la lista completa.
 *
 * El debounce vive en este componente, no en el padre: la
 * responsabilidad del control de input (incluido el ritmo al
 * que avisa al exterior) le pertenece a quien pinta el input.
 */
@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [ReactiveFormsModule, UiIconComponent],
  template: `
    <div class="search-wrap">
      <span class="search-icon" aria-hidden="true">
        <ui-icon name="search" [size]="18" [strokeWidth]="2" />
      </span>
      <input
        type="search"
        class="search-input"
        [attr.aria-label]="placeholder()"
        [placeholder]="placeholder()"
        [formControl]="control"
        autocomplete="off"
      />
      @if (control.value) {
        <button
          type="button"
          class="clear-btn"
          aria-label="Limpiar búsqueda"
          (click)="clear()"
        >
          <ui-icon name="x" [size]="16" [strokeWidth]="2" />
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .search-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .search-icon {
        position: absolute;
        left: 0.75rem;
        color: var(--color-slate-500, #64748b);
        pointer-events: none;
      }
      .search-input {
        width: 100%;
        padding: 0.5rem 2.25rem 0.5rem 2.25rem;
        background: var(--color-bg-secondary, #fff);
        border: 1px solid var(--color-border-subtle, #e2e8f0);
        border-radius: 0.5rem;
        font-size: 0.875rem;
        color: var(--color-slate-900, #0f172a);
        transition: border-color 0.15s ease;
      }
      .search-input:focus {
        outline: none;
        border-color: var(--color-brand-primary, #6d28d9);
        box-shadow: 0 0 0 3px rgba(109, 40, 217, 0.12);
      }
      .clear-btn {
        position: absolute;
        right: 0.5rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        color: var(--color-slate-500, #64748b);
        background: transparent;
        border: 0;
        border-radius: 0.25rem;
        cursor: pointer;
      }
      .clear-btn:hover {
        color: var(--color-slate-700, #334155);
        background: var(--color-bg-primary, #f1f5f9);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchBarComponent implements OnInit {
  readonly placeholder = input<string>('Buscar...');

  /** Emitido después de 300 ms sin teclear. */
  readonly searchChange = output<string>();

  /** Valor inicial opcional (p. ej. al limpiar filtros). */
  readonly initial = input<string>('');

  protected readonly control = new FormControl('', { nonNullable: true });
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const seed = this.initial();
    if (seed) this.control.setValue(seed, { emitEvent: false });
    this.control.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.searchChange.emit(value));
  }

  clear(): void {
    this.control.setValue('');
  }
}
