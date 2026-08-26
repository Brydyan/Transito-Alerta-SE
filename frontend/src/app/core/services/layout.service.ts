import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LayoutService {
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
