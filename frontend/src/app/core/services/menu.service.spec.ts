import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MenuService } from './menu.service';
import { environment } from '../../../environments/environment';

/**
 * F1 (F1.4.3) — TDD: tests escritos ANTES de modificar `menu.service.ts`.
 * Al ejecutarlos contra el código previo (que ignoraba `group`/`order`)
 * deben fallar en:
 *   - "propagates group from the backend response"
 *   - "uses backend order as menu_order"
 *   - "tolerates a response without group (backend desfasado)"
 *   - "the full D4 menu from the backend maps to 10 sidebar items"
 */
describe('MenuService (F1.4.3)', () => {
  let service: MenuService;
  let http: HttpTestingController;
  const apiUrl = `${environment.apiUrl}/menus/my`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [MenuService],
    });
    service = TestBed.inject(MenuService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('fetches the menu from /menus/my and stores it in the menuItems signal', (done) => {
    service.getMenuFromBackend().subscribe((items) => {
      expect(items.length).toBe(2);
      expect(service.menuItems().length).toBe(2);
      done();
    });

    const req = http.expectOne(apiUrl);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([
      { label: 'Dashboard', route: '/dashboard', order: 10 },
      { label: 'Usuarios', route: '/admin/users', group: 'GESTIÓN', order: 60 },
    ]);
  });

  it('propagates group from the backend response (F1.4.2)', (done) => {
    service.getMenuFromBackend().subscribe((items) => {
      const usuarios = items.find((i) => i.name === 'Usuarios');
      const dashboard = items.find((i) => i.name === 'Dashboard');
      expect(usuarios?.group).toBe('GESTIÓN');
      // Un item sin `group` en la respuesta no debe inventar un grupo.
      expect(dashboard?.group).toBeUndefined();
      done();
    });

    http.expectOne(apiUrl).flush([
      { label: 'Dashboard', route: '/dashboard', order: 10 },
      { label: 'Usuarios', route: '/admin/users', group: 'GESTIÓN', order: 60 },
    ]);
  });

  it('uses backend order as menu_order (F1.4.1)', (done) => {
    service.getMenuFromBackend().subscribe((items) => {
      // El menú llega ordenado por el backend (D3). El cliente lo respeta:
      // `menu_order` refleja el `order` del backend, no el índice del array.
      const dashboard = items.find((i) => i.name === 'Dashboard')!;
      const usuarios = items.find((i) => i.name === 'Usuarios')!;
      expect(dashboard.menu_order).toBe(10);
      expect(usuarios.menu_order).toBe(60);
      done();
    });

    http.expectOne(apiUrl).flush([
      { label: 'Dashboard', route: '/dashboard', order: 10 },
      { label: 'Usuarios', route: '/admin/users', group: 'GESTIÓN', order: 60 },
    ]);
  });

  it('tolerates a response without group (backend desfasado — F1.4.2)', (done) => {
    // Si el backend está viejo y todavía no envía `group`, el cliente
    // no debe lanzar: la entrada se transforma igual y renderiza sin
    // encabezado. La agrupación del sidebar degrada a "todos sin grupo".
    service.getMenuFromBackend().subscribe((items) => {
      expect(items.length).toBe(2);
      expect(items[0].group).toBeUndefined();
      expect(items[1].group).toBeUndefined();
      expect(items[0].name).toBe('Incidents'); // nombre viejo, mientras coexistan versiones
      done();
    });

    http.expectOne(apiUrl).flush([
      { label: 'Incidents', route: '/incidents', icon: 'alert-triangle' },
      { label: 'Users', route: '/users', icon: 'users' },
    ]);
  });

  it('the full D4 menu from the backend maps to 11 sidebar items (+ F6 audit-logs)', (done) => {
    service.getMenuFromBackend().subscribe((items) => {
      expect(items.length).toBe(11);
      // Las 3 secciones representadas en el D4.
      const groups = new Set(
        items.filter((i) => i.group).map((i) => i.group),
      );
      expect(groups).toEqual(new Set(['INCIDENCIAS', 'GESTIÓN', 'CATÁLOGOS']));
      done();
    });

    http.expectOne(apiUrl).flush([
      { label: 'Dashboard', route: '/dashboard', icon: 'layout-dashboard', order: 10 },
      { label: 'Inicio', route: '/inicio', icon: 'home', group: 'INCIDENCIAS', order: 20 },
      { label: 'Lista de Incidencias', route: '/incidencias', icon: 'list', group: 'INCIDENCIAS', order: 30 },
      { label: 'Mapa', route: '/mapa', icon: 'map', group: 'INCIDENCIAS', order: 40 },
      { label: 'Reportar', route: '/reportar', icon: 'plus-circle', group: 'INCIDENCIAS', order: 50 },
      { label: 'Usuarios', route: '/admin/users', icon: 'users', group: 'GESTIÓN', order: 60 },
      { label: 'Roles', route: '/admin/roles', icon: 'shield', group: 'GESTIÓN', order: 70 },
      { label: 'Organizaciones', route: '/organizaciones', icon: 'building-2', group: 'GESTIÓN', order: 80 },
      { label: 'Auditoría de Acceso', route: '/admin/audit-logs', icon: 'file-text', group: 'GESTIÓN', order: 85 },
      { label: 'Categorías', route: '/categorias', icon: 'tag', group: 'CATÁLOGOS', order: 90 },
      { label: 'Ubicaciones', route: '/ubicaciones', icon: 'map-pin', group: 'CATÁLOGOS', order: 100 },
    ]);
  });

  it('formatRoutes prefixes /app to bare routes (F1.4.4 regression)', (done) => {
    // Las rutas del backend llegan sin `/app` (lo agrega el cliente).
    // Verifica que el prefijado no duplica el segmento cuando la ruta
    // ya lo trae (caso improbable hoy, pero que F1.4.4 lista como
    // regresión potencial).
    service.getMenuFromBackend().subscribe((items) => {
      expect(items.find((i) => i.name === 'Dashboard')?.route).toBe('/app/dashboard');
      expect(items.find((i) => i.name === 'Usuarios')?.route).toBe('/app/admin/users');
      done();
    });

    http.expectOne(apiUrl).flush([
      { label: 'Dashboard', route: '/dashboard', order: 10 },
      { label: 'Usuarios', route: '/admin/users', group: 'GESTIÓN', order: 60 },
    ]);
  });

  it('transforms nested children from the F5 backend contract (F5.6)', (done) => {
    // F5 (D1): el backend envía el árbol anidado — roots con `children`.
    // Antes de F5.6 `transformBackendMenu` pisaba `children: []` y el
    // sidebar perdía todos los sub-ítems (regresión reportada 2026-09-14:
    // solo se veían dashboard/incidencias/gestion/catalogos).
    service.getMenuFromBackend().subscribe((items) => {
      expect(items.length).toBe(4); // Dashboard + 3 grupos
      const dashboard = items.find((i) => i.name === 'Dashboard')!;
      const incidencias = items.find((i) => i.name === 'INCIDENCIAS')!;
      expect(dashboard.children).toEqual([]);
      expect(incidencias.children?.length).toBe(4);
      expect(incidencias.children?.map((c) => c.name)).toEqual([
        'Inicio', 'Lista de Incidencias', 'Mapa', 'Reportar',
      ]);
      const mapa = incidencias.children!.find((c) => c.name === 'Mapa')!;
      expect(mapa.route).toBe('/app/mapa'); // formatRoutes recursivo ya lo prefija
      expect(mapa.icon).toBe('map');
      expect(mapa.menu_order).toBe(40);
      expect(mapa.parent_menu_id).toBe(incidencias.id);
      // Los grupos llegan sin ruta (encabezados de sección): no deben romper nada.
      expect(incidencias.route).toBe('');
      done();
    });

    http.expectOne(apiUrl).flush([
      { label: 'Dashboard', route: '/dashboard', icon: 'layout-dashboard', order: 10 },
      {
        label: 'INCIDENCIAS', route: '', order: 20, children: [
          { label: 'Inicio', route: '/inicio', icon: 'home', order: 20 },
          { label: 'Lista de Incidencias', route: '/incidencias', icon: 'list', order: 30 },
          { label: 'Mapa', route: '/mapa', icon: 'map', order: 40 },
          { label: 'Reportar', route: '/reportar', icon: 'plus-circle', order: 50 },
        ],
      },
      {
        label: 'GESTIÓN', route: '', order: 60, children: [
          { label: 'Usuarios', route: '/admin/users', icon: 'users', order: 60 },
          { label: 'Roles', route: '/admin/roles', icon: 'shield', order: 70 },
          { label: 'Organizaciones', route: '/organizaciones', icon: 'building-2', order: 80 },
        ],
      },
      {
        label: 'CATÁLOGOS', route: '', order: 90, children: [
          { label: 'Categorías', route: '/categorias', icon: 'tag', order: 90 },
          { label: 'Ubicaciones', route: '/ubicaciones', icon: 'map-pin', order: 100 },
        ],
      },
    ]);
  });

  // sc-334 admin-controles-enhancements Phase 9 — sidebar depth cap.
  // After migration 0060 added CRUD sub-sub-menus (3rd level under each
  // sub-menu), the backend started including them in /api/menus/my. The
  // sidebar is a 2-level tree — sub-sub-menus (Crear/Editar X) belong
  // exclusively to /app/admin/controles (which reads /api/menu-options
  // directly and renders the full tree via MenuTreeComponent). Clicking
  // "Usuarios" in the sidebar navigates to /admin/users; the Crear/Editar
  // actions live inside that page, not as nested sidebar entries.

  it('hides 3rd-level items from the sidebar (only /app/admin/controles shows them)', (done) => {
    service.getMenuFromBackend().subscribe((items) => {
      const gestion = items.find((i) => i.name === 'GESTIÓN')!;
      const usuarios = gestion.children!.find((c) => c.name === 'Usuarios')!;
      // 3rd-level items are not exposed in the sidebar at all. Usuarios
      // stays as a flat link (children = []) — no chevron, no nested entries.
      expect(usuarios.children).toEqual([]);
      // The CRUD sub-sub-menus must NOT appear anywhere in the sidebar tree.
      const flatNames = JSON.stringify(items).includes('Crear usuario');
      const flatNames2 = JSON.stringify(items).includes('Editar usuario');
      expect(flatNames).toBe(false);
      expect(flatNames2).toBe(false);
      // Total items in the sidebar: 1 GESTIÓN + 2 children (Usuarios, Roles) = 3.
      // The 2 CRUD items from the fixture are intentionally excluded.
      expect(items.length).toBe(1);
      expect(gestion.children!.length).toBe(2);
      expect(service.countAllItems(items)).toBe(3);
      done();
    });

    http.expectOne(apiUrl).flush([
      {
        label: 'GESTIÓN',
        route: '',
        order: 60,
        children: [
          {
            label: 'Usuarios',
            route: '/admin/users',
            icon: 'users',
            order: 60,
            children: [
              { label: 'Crear usuario', route: '/admin/users/new', icon: 'user-plus', order: 61 },
              { label: 'Editar usuario', route: '/admin/users', icon: 'user-edit', order: 62 },
            ],
          },
          { label: 'Roles', route: '/admin/roles', icon: 'shield', order: 70 },
        ],
      },
    ]);
  });
});
