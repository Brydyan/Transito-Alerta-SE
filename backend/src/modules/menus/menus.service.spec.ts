import { AuthService } from '../auth/auth.service';
import { MenusService } from './menus.service';

/**
 * F1 — TDD: estos tests se escribieron ANTES de modificar `menus.service.ts`
 * ni `menu-map.ts`. Al ejecutarlos contra el código de la ronda anterior
 * (5 entradas en inglés, sin `group` ni `order`) deben fallar:
 *   - "propagates group from the definition"
 *   - "propagates order from the definition"
 *   - "orders the result by order ascending"
 *   - "omits groups that become empty after permission filtering"
 *   - "the full-permission user sees the 10-entry D4 map"
 *   - "operador_org sees a coherent subset without orphan headers"
 */
describe('MenusService', () => {
  let authService: { getPermissionsByUserId: jest.Mock };
  let service: MenusService;

  beforeEach(() => {
    authService = { getPermissionsByUserId: jest.fn() };
    service = new MenusService(authService as unknown as jest.Mocked<AuthService>);
  });

  it('resolves permissions via AuthService.getPermissionsByUserId (same cache path as PermissionGuard)', async () => {
    authService.getPermissionsByUserId.mockResolvedValue([]);

    await service.getMenuForUser('user-1');

    expect(authService.getPermissionsByUserId).toHaveBeenCalledWith('user-1');
  });

  // Permisos equivalentes al seed de `master@tase.local` (35 permisos).
  // Sólo los que el mapa D4 requiere para que la entrada quede visible.
  const ALL_MENU_PERMISSIONS = [
    'READ incidents',
    'CREATE incidents',
    'READ users',
    'READ roles',
    'READ organizations',
    'READ incident-categories',
    'READ geo-zones',
  ];

  it('a full-permission user sees every menu entry (10 entries per D4)', async () => {
    authService.getPermissionsByUserId.mockResolvedValue(ALL_MENU_PERMISSIONS);

    const result = await service.getMenuForUser('user-1');

    expect(result).toHaveLength(10);
    // El orden es por `order` ascendente, no por iteración de Object.entries.
    expect(result.map((e) => e.label)).toEqual([
      'Dashboard',
      'Inicio',
      'Lista de Incidencias',
      'Mapa',
      'Reportar',
      'Usuarios',
      'Roles',
      'Organizaciones',
      'Categorías',
      'Ubicaciones',
    ]);
  });

  it('propagates group from the definition (D3/D4)', async () => {
    authService.getPermissionsByUserId.mockResolvedValue(ALL_MENU_PERMISSIONS);

    const result = await service.getMenuForUser('user-1');

    const dashboard = result.find((e) => e.label === 'Dashboard');
    const inicio = result.find((e) => e.label === 'Inicio');
    const usuarios = result.find((e) => e.label === 'Usuarios');
    const categorias = result.find((e) => e.label === 'Categorías');

    // Dashboard no tiene grupo — se renderiza sin encabezado.
    expect(dashboard?.group).toBeUndefined();
    // Las entradas agrupadas llevan el nombre del grupo.
    expect(inicio?.group).toBe('INCIDENCIAS');
    expect(usuarios?.group).toBe('GESTIÓN');
    expect(categorias?.group).toBe('CATÁLOGOS');
  });

  it('propagates order from the definition (D3/D4)', async () => {
    authService.getPermissionsByUserId.mockResolvedValue(ALL_MENU_PERMISSIONS);

    const result = await service.getMenuForUser('user-1');

    // El orden de la respuesta es estrictamente ascendente por `order`,
    // no por iteración de Object.entries() — el bug que D3 explícitamente
    // busca cerrar.
    const orders = result.map((e) => e.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(result[0].order).toBe(10);  // Dashboard
    expect(result[9].order).toBe(100); // Ubicaciones
  });

  it('orders the result by order ascending (deterministic, not insertion order)', async () => {
    authService.getPermissionsByUserId.mockResolvedValue(ALL_MENU_PERMISSIONS);

    const result = await service.getMenuForUser('user-1');

    // Aunque las claves del MENU_MAP se inserten en cualquier orden, la
    // respuesta viene ordenada por `order` ascendente. Esto protege contra
    // el modo de fallo original: orden accidental de Object.entries().
    expect(result.map((e) => e.order)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('omits groups that become empty after permission filtering', async () => {
    // Un usuario con permisos reducidos: no ve ni CATÁLOGOS ni GESTIÓN.
    // El grupo queda vacío tras el filtrado y el backend no debe emitir
    // un encabezado huérfano.
    authService.getPermissionsByUserId.mockResolvedValue([
      'READ incidents',
      'CREATE incidents',
    ]);

    const result = await service.getMenuForUser('user-1');

    // Sólo debe ver las entradas del grupo INCIDENCIAS + Dashboard (sin grupo).
    expect(result.map((e) => e.label)).toEqual([
      'Dashboard',
      'Inicio',
      'Lista de Incidencias',
      'Mapa',
      'Reportar',
    ]);
    // No debe haber entradas con grupo GESTIÓN ni CATÁLOGOS.
    expect(result.find((e) => e.group === 'GESTIÓN')).toBeUndefined();
    expect(result.find((e) => e.group === 'CATÁLOGOS')).toBeUndefined();
  });

  it('operador_org (15 permisos) sees a coherent subset without orphan headers (F1.2.3)', async () => {
    // Subset representativo: el operador de organización tiene acceso a
    // incidencias (lectura y creación) y a organizaciones. NO ve usuarios,
    // roles, categorías, ni ubicaciones. El menú resultante no debe tener
    // encabezados GESTIÓN/CATÁLOGOS con cero entradas.
    authService.getPermissionsByUserId.mockResolvedValue([
      'READ incidents',
      'CREATE incidents',
      'READ organizations',
    ]);

    const result = await service.getMenuForUser('user-1');

    expect(result.map((e) => e.label)).toEqual([
      'Dashboard',
      'Inicio',
      'Lista de Incidencias',
      'Mapa',
      'Reportar',
      'Organizaciones',
    ]);
    // GESTIÓN tiene una entrada (Organizaciones) — no es huérfano.
    expect(result.filter((e) => e.group === 'GESTIÓN')).toHaveLength(1);
    // CATÁLOGOS queda vacío y no aparece.
    expect(result.find((e) => e.group === 'CATÁLOGOS')).toBeUndefined();
  });

  it('a user lacking READ assignments does not see a stale Assignments entry (regresión)', async () => {
    // F1.1.3 retiró `Assignments` del mapa. Si vuelve a aparecer con un
    // permiso que el usuario no tiene, el resultado debe seguir limpio:
    // ninguna entrada con label `Assignments`.
    authService.getPermissionsByUserId.mockResolvedValue([
      'READ incidents',
      'READ assignments',
    ]);

    const result = await service.getMenuForUser('user-1');

    expect(result.find((e) => e.label === 'Assignments')).toBeUndefined();
    expect(result.find((e) => e.label === 'Comments')).toBeUndefined();
  });

  it('a user with no permissions sees an empty menu', async () => {
    authService.getPermissionsByUserId.mockResolvedValue([]);

    const result = await service.getMenuForUser('user-1');

    expect(result).toEqual([]);
  });
});
