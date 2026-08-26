import { Directive, ElementRef, HostListener, inject, output } from '@angular/core';

/**
 * Emite (appClickOutside) cuando se hace click fuera del elemento al que
 * está aplicada la directiva. Encapsula el listener de documento para que
 * los componentes consumidores usen la API de outputs de Angular.
 */
@Directive({
  selector: '[appClickOutside]',
  standalone: true,
})
export class ClickOutsideDirective {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly appClickOutside = output<Event>();

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as Node;
    if (target && !this.host.nativeElement.contains(target)) {
      this.appClickOutside.emit(event);
    }
  }
}
