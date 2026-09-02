import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ElementRef,
  effect,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LUCIDE_ICONS, LucideIconData, LucideIconNode } from 'lucide-angular';

/**
 * `<ui-icon>` — envoltorio sobre la familia Lucide para el shell de la app.
 *
 * Por qué existe (D3, `openspec/changes/front/2026-08-29-f0-design-system-mock-alignment/design.md`):
 * el backend ya emite nombres Lucide (`alert-triangle`, `clipboard-list`, …) pero el
 * shell los inyectaba en un span `.material-symbols-outlined`, que imprimía el
 * nombre crudo. Este componente cierra ese defecto.
 *
 * Contrato:
 * - `name`        requerido, nombre Lucide kebab-case.
 * - `size`        px (def. 20).
 * - `strokeWidth` (def. 1.75).
 * - `ariaLabel`   opcional; si se omite, el icono se marca `aria-hidden`.
 * - `extraClass`  clases extra que el consumidor quiera añadir (tamaños, mr-*).
 *
 * Comportamiento de respaldo: nombre no registrado → `circle-dot` (nunca el
 * texto crudo en el DOM). El respaldo también se aplica cuando no hay
 * provider de iconos (test aislado, SSR sin iconos).
 *
 * @example
 *   <ui-icon name="alert-triangle" [size]="20" />
 *   <ui-icon name="search" ariaLabel="Buscar" />
 *   <ui-icon name="users" extraClass="mr-2 align-middle" />
 */
@Component({
  selector: 'ui-icon',
  standalone: true,
  template: `<span [innerHTML]="svg()" [attr.aria-label]="ariaLabel() || null" [attr.role]="ariaLabel() ? 'img' : null" [attr.aria-hidden]="ariaLabel() ? null : 'true'" [class]="'ui-icon text-current shrink-0 inline-flex ' + extraClass()"></span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiIconComponent {
  // LUCIDE_ICONS es multi: true → `inject()` debería devolver un array de
  // LucideIconProvider (uno por cada `LucideAngularModule.pick({...})`).
  // Nos defendemos por si Angular lo entrega envuelto/null: lo normalizamos
  // a un array uniforme.
  private readonly iconProviders: ReadonlyArray<{
    hasIcon(name: string): boolean;
    getIcon(name: string): LucideIconData | null;
  }> = this.normalizeProviders(inject(LUCIDE_ICONS, { optional: true }));

  private readonly sanitizer = inject(DomSanitizer);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly name = input.required<string>();
  readonly size = input<number>(20);
  readonly strokeWidth = input<number>(1.75);
  readonly ariaLabel = input<string>('');
  readonly extraClass = input<string>('');

  /** Nombre que se va a renderizar (con respaldo). */
  readonly resolved = computed<string>(() => {
    const requested = this.name();
    if (requested && this.hasIcon(requested)) {
      return requested;
    }
    return 'circle-dot';
  });

  /** SVG inline, sanitizado, listo para `[innerHTML]`. */
  readonly svg = computed<SafeHtml>(() => {
    const data = this.getIcon(this.resolved());
    if (!data) {
      return this.sanitizer.bypassSecurityTrustHtml(
        renderFallback(this.size(), this.strokeWidth()),
      );
    }
    return this.sanitizer.bypassSecurityTrustHtml(
      renderIcon(data, this.size(), this.strokeWidth()),
    );
  });

  private hasIcon(name: string): boolean {
    return this.iconProviders.some((p) => p?.hasIcon?.(name));
  }

  private getIcon(name: string): LucideIconData | null {
    for (const p of this.iconProviders) {
      if (p?.hasIcon?.(name)) {
        return p.getIcon(name);
      }
    }
    return null;
  }

  private normalizeProviders(value: unknown): ReadonlyArray<{
    hasIcon(name: string): boolean;
    getIcon(name: string): LucideIconData | null;
  }> {
    if (Array.isArray(value)) {
      return value as ReadonlyArray<{
        hasIcon(name: string): boolean;
        getIcon(name: string): LucideIconData | null;
      }>;
    }
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as { hasIcon?: unknown }).hasIcon === 'function'
    ) {
      return [value as {
        hasIcon(name: string): boolean;
        getIcon(name: string): LucideIconData | null;
      }];
    }
    return [];
  }

  constructor() {
    // Tamaño también en el host, para que `currentColor` se herede bien
    // cuando el consumidor no envuelve el SVG en un span propio.
    effect(() => {
      const el = this.host.nativeElement;
      el.style.width = `${this.size()}px`;
      el.style.height = `${this.size()}px`;
    });
  }
}

type IconAttrs = Record<string, string | number>;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderNode(node: LucideIconNode, size: number, strokeWidth: number): string {
  const [tag, attrs] = node;
  const merged: IconAttrs = {
    ...attrs,
    width: size,
    height: size,
    'stroke-width': strokeWidth,
  };
  const attrStr = Object.entries(merged)
    .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
    .join(' ');
  return `<${tag} ${attrStr}></${tag}>`;
}

function renderIcon(
  data: LucideIconData,
  size: number,
  strokeWidth: number,
): string {
  return data.map((n) => renderNode(n, size, strokeWidth)).join('');
}

/** Respaldo absoluto — círculo con punto central, sin tocar librerías. */
function renderFallback(size: number, strokeWidth: number): string {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const inner = Math.max(1, size / 8);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}" fill="none" stroke="currentColor" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
    `<circle cx="${cx}" cy="${cy}" r="${r}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${inner}" fill="currentColor"/>` +
    `</svg>`
  );
}
