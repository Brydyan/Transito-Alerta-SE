import { Injectable, signal } from '@angular/core';
import { Observable, fromEvent, map, debounceTime, shareReplay } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  /** lg breakpoint (S7.1) — card mode below this width, table above. */
  private readonly breakpoint = 1024;

  /**
   * Reactive viewport detection (D2).
   * Emits `true` when `window.innerWidth < 1024` (mobile/tablet),
   * `false` when >= 1024 (desktop/table mode).
   * Debounces resize events by 200ms and replays the last value.
   */
  readonly isSmallViewport$: Observable<boolean> = fromEvent(
    typeof window !== 'undefined' ? window : globalThis,
    'resize',
  ).pipe(
    debounceTime(200),
    map(() => window.innerWidth < this.breakpoint),
    shareReplay(1),
  );

  // Estado del sidebar (true = abierto, false = cerrado)
  readonly sidebarOpen = signal<boolean>(true);

  /**
   * Cambia el estado del sidebar
   */
  toggleSidebar(): void {
    this.sidebarOpen.update((value) => !value);
  }

  /**
   * Abre el sidebar
   */
  openSidebar(): void {
    this.sidebarOpen.set(true);
  }

  /**
   * Cierra el sidebar
   */
  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }
}
