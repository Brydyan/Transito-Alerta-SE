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

  it('the full D4 menu from the backend maps to 10 sidebar items (F1.2.3 cross-check)', (done) => {
    service.getMenuFromBackend().subscribe((items) => {
      expect(items.length).toBe(10);
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
});
