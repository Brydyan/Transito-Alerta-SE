import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { importProvidersFrom } from '@angular/core';
import { LucideAngularModule, AlertTriangle, ClipboardList, Search } from 'lucide-angular';
import { Sidebar } from './sidebar.component';
import { MenuService } from '../../core/services/menu.service';
import { LayoutService } from '../../core/services/layout.service';
import { MenuItem } from '../../core/models/menu.model';

const ICONS = { AlertTriangle, ClipboardList, Search };

function makeMenuService(items: MenuItem[]) {
  return {
    menuItems: signal<MenuItem[]>(items),
  };
}

function makeLayoutService(open = true) {
  return {
    sidebarOpen: signal(open),
    openSidebar: jest.fn(),
    toggleSidebar: jest.fn(),
    closeSidebar: jest.fn(),
  };
}

const MENU: MenuItem[] = [
  { id: 1, name: 'Dashboard', route: '/app/dashboard', icon: 'clipboard-list', menu_order: 1, is_active: true },
  { id: 2, name: 'Incidencias', route: '/app/incidents', icon: 'alert-triangle', group: 'INCIDENCIAS', menu_order: 2, is_active: true },
  { id: 3, name: 'Asignaciones', route: '/app/assignments', icon: 'clipboard-list', group: 'INCIDENCIAS', menu_order: 3, is_active: true },
  { id: 4, name: 'Usuarios', route: '/app/users', icon: 'clipboard-list', group: 'ADMINISTRACIÓN', menu_order: 4, is_active: true },
  { id: 5, name: 'Roles', route: '/app/roles', icon: 'clipboard-list', group: 'ADMINISTRACIÓN', menu_order: 5, is_active: true },
];

async function renderSidebar() {
  return render(`<app-sidebar></app-sidebar>`, {
    imports: [Sidebar],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      importProvidersFrom(LucideAngularModule.pick(ICONS)),
      { provide: MenuService, useValue: makeMenuService(MENU) },
      { provide: LayoutService, useValue: makeLayoutService() },
    ],
  });
}

describe('Sidebar (F0.3 + F0.5.3)', () => {
  it('renders items without a group before the first section header', async () => {
    await renderSidebar();

    const nav = screen.getByRole('navigation');
    const text = nav.textContent || '';

    // El item sin group (Dashboard) precede al primer encabezado INCIDENCIAS.
    const dashIdx = text.indexOf('Dashboard');
    const incIdx = text.indexOf('INCIDENCIAS');
    expect(dashIdx).toBeGreaterThanOrEqual(0);
    expect(incIdx).toBeGreaterThanOrEqual(0);
    expect(dashIdx).toBeLessThan(incIdx);
  });

  it('groups items under their section header, preserving backend order', async () => {
    await renderSidebar();

    const nav = screen.getByRole('navigation');
    const text = nav.textContent || '';

    const incIdx = text.indexOf('INCIDENCIAS');
    const incItems = text.indexOf('Incidencias');
    const asgItems = text.indexOf('Asignaciones');
    const admIdx = text.indexOf('ADMINISTRACIÓN');
    const usrItems = text.indexOf('Usuarios');
    const rolItems = text.indexOf('Roles');

    expect(incIdx).toBeLessThan(incItems);
    expect(incItems).toBeLessThan(asgItems);
    expect(asgItems).toBeLessThan(admIdx);
    expect(admIdx).toBeLessThan(usrItems);
    expect(usrItems).toBeLessThan(rolItems);
  });

  it('marks the active item by actually navigating the router', async () => {
    // F0.5.3 (corregido por WARNING-4 de fixes-required.md): navegamos de
    // verdad y dejamos que `routerLinkActive` aplique la clase `active`.
    // Antes el test sólo leía el HTML del template — un typo en el
    // selector pasaba.
    const view = await renderSidebar();
    const router = view.fixture.componentRef.injector.get(Router);
    await router.navigateByUrl('/app/users');
    view.detectChanges();

    const usersLink = Array.from(document.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/app/users',
    );
    expect(usersLink).toBeTruthy();
    expect(usersLink?.classList.contains('active')).toBe(true);

    // Ningún otro link del menú debe tener la clase `active` (el match es exacto).
    const others = Array.from(document.querySelectorAll('a.active')).filter(
      (a) => a !== usersLink,
    );
    expect(others).toEqual([]);
  });

  it('the consumer CSS for the active state targets the token brand-primary-soft', async () => {
    // jsdom no carga Tailwind, así que el fondo computado no es legible
    // en jsdom. Lo que sí podemos es leer la regla CSS literal que el
    // layout.css declara y verificar que la clase `.active` mapea al
    // token violeta. Es la mitad de la red anti-regresión.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(
      path.resolve(__dirname, '../../../styles/_layout.css'),
      'utf8',
    );
    expect(css).toMatch(/\.nav-link-custom\.active[\s\S]*var\(--color-brand-primary-soft\)/);
  });
});
