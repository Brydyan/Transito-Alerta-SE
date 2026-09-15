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

describe('Sidebar (F5 flatten — look original plan, sin colapsables)', () => {
  const NESTED_MENU: MenuItem[] = [
    { id: 1, name: 'Dashboard', route: '/app/dashboard', icon: 'clipboard-list', menu_order: 10, is_active: true, children: [] },
    {
      id: 2, name: 'INCIDENCIAS', route: '', menu_order: 20, is_active: true,
      children: [
        { id: 3, name: 'Inicio', route: '/app/inicio', icon: 'home', menu_order: 20, is_active: true, children: [] },
        { id: 4, name: 'Lista de Incidencias', route: '/app/incidencias', icon: 'list', menu_order: 30, is_active: true, children: [] },
        { id: 5, name: 'Mapa', route: '/app/mapa', icon: 'map', menu_order: 40, is_active: true, children: [] },
        { id: 6, name: 'Reportar', route: '/app/reportar', icon: 'plus-circle', menu_order: 50, is_active: true, children: [] },
      ],
    },
    {
      id: 7, name: 'GESTIÓN', route: '', menu_order: 60, is_active: true,
      children: [
        { id: 8, name: 'Usuarios', route: '/app/admin/users', icon: 'users', menu_order: 60, is_active: true, children: [] },
        { id: 9, name: 'Roles', route: '/app/admin/roles', icon: 'shield', menu_order: 70, is_active: true, children: [] },
        { id: 10, name: 'Organizaciones', route: '/app/organizaciones', icon: 'building-2', menu_order: 80, is_active: true, children: [] },
      ],
    },
    {
      id: 11, name: 'CATÁLOGOS', route: '', menu_order: 90, is_active: true,
      children: [
        { id: 12, name: 'Categorías', route: '/app/categorias', icon: 'tag', menu_order: 90, is_active: true, children: [] },
        { id: 13, name: 'Ubicaciones', route: '/app/ubicaciones', icon: 'map-pin', menu_order: 100, is_active: true, children: [] },
      ],
    },
  ];

  async function renderNestedSidebar() {
    return render(`<app-sidebar></app-sidebar>`, {
      imports: [Sidebar],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        importProvidersFrom(LucideAngularModule.pick(ICONS)),
        { provide: MenuService, useValue: makeMenuService(NESTED_MENU) },
        { provide: LayoutService, useValue: makeLayoutService() },
      ],
    });
  }

  it('renders ALL children as visible links grouped under their section header (regresión 2026-09-14)', async () => {
    // El backend F5 manda el árbol anidado (D1). El look original F1 era
    // plano: sección + links visibles, sin desplegables. Los grupos sin
    // ruta (encabezados) deben aplanarse: sus hijos se renderizan como
    // links, NUNCA ocultos tras un botón colapsable.
    await renderNestedSidebar();

    const nav = screen.getByRole('navigation');
    const text = nav.textContent || '';

    // Todos los sub-ítems están visibles sin expandir nada.
    for (const name of ['Inicio', 'Lista de Incidencias', 'Mapa', 'Reportar', 'Usuarios', 'Roles', 'Organizaciones', 'Categorías', 'Ubicaciones']) {
      expect(text).toContain(name);
    }

    // Orden plano: Dashboard → INCIDENCIAS (header + hijos) → GESTIÓN → CATÁLOGOS.
    const dashIdx = text.indexOf('Dashboard');
    const incHeader = text.indexOf('INCIDENCIAS');
    const inicioIdx = text.indexOf('Inicio');
    const mapaIdx = text.indexOf('Mapa');
    const gestionIdx = text.indexOf('GESTIÓN');
    const usuariosIdx = text.indexOf('Usuarios');
    const catalogosIdx = text.indexOf('CATÁLOGOS');
    const categoriasIdx = text.indexOf('Categorías');
    expect(dashIdx).toBeGreaterThanOrEqual(0);
    expect(incHeader).toBeGreaterThan(dashIdx);
    expect(inicioIdx).toBeGreaterThan(incHeader);
    expect(mapaIdx).toBeGreaterThan(inicioIdx);
    expect(gestionIdx).toBeGreaterThan(mapaIdx);
    expect(usuariosIdx).toBeGreaterThan(gestionIdx);
    expect(catalogosIdx).toBeGreaterThan(usuariosIdx);
    expect(categoriasIdx).toBeGreaterThan(catalogosIdx);
  });

  it('the flattened children are real router links (no collapsible button hides them)', async () => {
    await renderNestedSidebar();

    // Cada hijo es un <a> navegable, no un botón que oculta el sub-ítem.
    for (const href of ['/app/inicio', '/app/mapa', '/app/admin/users', '/app/ubicaciones']) {
      const link = Array.from(document.querySelectorAll('a')).find((a) => a.getAttribute('href') === href);
      expect(link?.getAttribute('href')).toBe(href);
    }

    // El encabezado de sección NO es un link (no tiene ruta).
    const headerButtons = Array.from(document.querySelectorAll('button')).filter(
      (b) => (b.textContent || '').includes('INCIDENCIAS'),
    );
    expect(headerButtons).toEqual([]);
  });
});
