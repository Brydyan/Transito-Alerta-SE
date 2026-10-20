import { Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { PermissionLookupService } from './permission-lookup.service';
import { PermissionEntity } from '../../modules/permissions/entities/permission.entity';

/**
 * 2026-10-20-auth-me-500 — regresión del 500 de `GET /api/auth/me`.
 *
 * `getDescriptionsByUuids` construye `where: { id: In(uuids) }` sobre la
 * columna `permissions.id` (`uuid`). TypeORM no castea los binds: los delega a
 * Postgres, que castea el parámetro a `uuid` y aborta con
 * `22P02 invalid input syntax for type uuid` ante cualquier string que no lo
 * sea. Ese error sin catch se traduce en el 500 genérico de Nest
 * (`{"statusCode":500,"message":"Internal server error"}` — 52 bytes exactos)
 * y tumba `GET /api/auth/me`, que es el funnel de TODA request Bearer.
 *
 * El vector eran los elementos en formato `resource:ACTION` que la migración
 * `0021 §6` inyectó en `roles.permissions` (`"incident-images:CREATE"`,
 * `"incident-images:DELETE"`) y que `0026` no pudo remapear porque su
 * `LEFT JOIN` parsea por espacio. Se propagaron a `users.permissions` y
 * `AuthService.getMe` los pasó enteros al resolver.
 *
 * Estos tests fijan el contrato: una fila corrupta degrada a "permisos
 * faltantes" (un 403 en un endpoint), nunca a un 500 que rompe el login.
 * `0038_permissions_uuid_normalization.sql` limpia el dato en la fuente; esta
 * es la mitad del guard en runtime.
 */
describe('PermissionLookupService.getDescriptionsByUuids — filtrado de no-UUIDs', () => {
  const UUID_READ_INCIDENTS = '14ca41c5-c637-4a49-b9e2-2e67a17ef1bf';
  const UUID_UPDATE_ASSIGNMENTS = '1dc3086a-8668-4ece-93f7-495cd548ea5d';

  /** Filas que el repo devolvería para un `IN` con esos ids. */
  const CATALOG_ROWS: PermissionEntity[] = [
    {
      id: UUID_READ_INCIDENTS,
      resource: 'incidents',
      action: 'READ' as PermissionEntity['action'],
    } as PermissionEntity,
    {
      id: UUID_UPDATE_ASSIGNMENTS,
      resource: 'assignments',
      action: 'UPDATE' as PermissionEntity['action'],
    } as PermissionEntity,
  ];

  function makeService(findResult: PermissionEntity[] = CATALOG_ROWS) {
    const find = jest.fn().mockResolvedValue(findResult);
    const repo = { find } as unknown as jest.Mocked<Repository<PermissionEntity>>;
    const service = new PermissionLookupService(repo);
    return { service, find, repo };
  }

  /**
   * Los ids que realmente llegaron a la query.
   *
   * No puede leer `mock.calls[0]` a ciegas: la PRIMERA llamada de la vida del
   * servicio es `buildCache()`, cuyo `where` es `{ deletedAt: IsNull() }` — sin
   * `id`. Buscamos la primera que sí lo trae, que es la de
   * `getDescriptionsByUuids`.
   */
  function queriedIds(find: jest.Mock): unknown[] {
    const call = find.mock.calls.find(([arg]) => arg?.where?.id !== undefined);
    if (!call) return [];
    const where = (call[0] as { where: { id: unknown } }).where;
    return (where.id as { _value?: unknown[] })._value ?? [];
  }

  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('NO consulta la DB cuando TODAS las entradas son no-UUID (el caso del 500)', async () => {
    const { service, find } = makeService();

    // Exactamente los dos strings que 0021 §6 dejó en `users.permissions`.
    const result = await service.getDescriptionsByUuids([
      'incident-images:CREATE',
      'incident-images:DELETE',
    ]);

    expect(result).toEqual([]);
    // Si se llegara a `In()`, el mock devolvería filas y el test no detectaría
    // nada; lo que importa es que `permissionRepo.find` nunca se invoque.
    expect(find).not.toHaveBeenCalled();
  });

  it('filtra los no-UUID y sólo envía los válidos al IN', async () => {
    const { service, find } = makeService([CATALOG_ROWS[0]]);

    const result = await service.getDescriptionsByUuids([
      UUID_READ_INCIDENTS,
      'incident-images:CREATE',
      'UPDATE assignments', // el string que 0037 reintrodujo
      UUID_UPDATE_ASSIGNMENTS,
    ]);

    expect(queriedIds(find)).toEqual([UUID_READ_INCIDENTS, UUID_UPDATE_ASSIGNMENTS]);
    expect(result).toEqual(['READ incidents']);
  });

  it('loguea un WARN con el conteo y una muestra de lo descartado', async () => {
    const { service } = makeService([]);

    await service.getDescriptionsByUuids([
      UUID_READ_INCIDENTS,
      'incident-images:CREATE',
      'algo:sin:dos:puntos',
    ]);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('2/3');
    expect(message).toContain('incident-images:CREATE');
    // El mensaje debe señalar el origen y el remedio, no sólo que "algo falló".
    expect(message).toContain('0038_permissions_uuid_normalization.sql');
  });

  it('no loguea WARN cuando todas las entradas son válidas', async () => {
    const { service } = makeService(CATALOG_ROWS);

    const result = await service.getDescriptionsByUuids([
      UUID_READ_INCIDENTS,
      UUID_UPDATE_ASSIGNMENTS,
    ]);

    expect(result).toEqual(['READ incidents', 'UPDATE assignments']);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('regresión — el array exacto de staging no lanza y devuelve sólo los válidos', async () => {
    const { service, find } = makeService([CATALOG_ROWS[0]]);

    // 3 UUIDs válidos + los 2 strings corruptos, en el mismo orden que la
    // fila observada en tase-staging.
    const stagingRow = [
      UUID_READ_INCIDENTS,
      UUID_UPDATE_ASSIGNMENTS,
      '14ca41c5-c637-4a49-b9e2-2e67a17ef1bf',
      'incident-images:CREATE',
      'incident-images:DELETE',
    ];

    const result = await service.getDescriptionsByUuids(stagingRow);

    // Sin excepción — antes esto era `22P02` y terminaba en 500.
    expect(result).toEqual(['READ incidents']);
    expect(queriedIds(find)).not.toContain('incident-images:CREATE');
    expect(queriedIds(find)).not.toContain('incident-images:DELETE');
  });

  it('acepta UUIDs en mayúsculas (Postgres los normaliza a minúsculas)', async () => {
    const { service, find } = makeService([CATALOG_ROWS[0]]);

    await service.getDescriptionsByUuids([UUID_READ_INCIDENTS.toUpperCase()]);

    expect(queriedIds(find)).toEqual([UUID_READ_INCIDENTS.toUpperCase()]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('devuelve [] sin tocar la DB para entrada vacía o nula', async () => {
    const { service, find } = makeService();

    await expect(service.getDescriptionsByUuids([])).resolves.toEqual([]);
    await expect(
      service.getDescriptionsByUuids(undefined as unknown as string[]),
    ).resolves.toEqual([]);

    expect(find).not.toHaveBeenCalled();
  });

  it('no confunde un prefijo UUID con un UUID completo', async () => {
    const { service, find } = makeService();

    await service.getDescriptionsByUuids([UUID_READ_INCIDENTS.slice(0, 12)]);

    expect(find).not.toHaveBeenCalled();
  });
});

describe('PermissionLookupService — catálogo y cache', () => {
  const CATALOG: Partial<PermissionEntity>[] = [
    { id: 'aaaaaaaa-0000-0000-0000-000000000001', action: 'READ', resource: 'incidents' },
    { id: 'aaaaaaaa-0000-0000-0000-000000000002', action: 'UPDATE', resource: 'assignments' },
    { id: 'aaaaaaaa-0000-0000-0000-000000000003', action: 'CREATE', resource: 'users' },
  ];

  function makeService() {
    // `buildCache` llama `find({ where: { deletedAt: IsNull() }, select: [...] })`
    // — sin `where.id`. `getDescriptionsByUuids` sí lo trae. El mock sirve
    // ambos caminos para no tener que distinguir por call index.
    const find = jest.fn().mockImplementation(({ where }: { where?: { id?: unknown } }) => {
      const ids = (where?.id as { _value?: string[] } | undefined)?._value;
      if (ids) {
        return Promise.resolve(CATALOG.filter((r) => ids.includes(r.id!)));
      }
      return Promise.resolve(CATALOG);
    });
    const repo = { find } as unknown as jest.Mocked<Repository<PermissionEntity>>;
    return { service: new PermissionLookupService(repo), find };
  }

  it('construye el índice "ACTION resource" una vez y lo reutiliza', async () => {
    const { service, find } = makeService();

    await service.buildCache();
    expect(find).toHaveBeenCalledTimes(1);

    expect(service.getUuidSync('READ', 'incidents')).toBe('aaaaaaaa-0000-0000-0000-000000000001');
    expect(service.getUuidSync('UPDATE', 'assignments')).toBe('aaaaaaaa-0000-0000-0000-000000000002');

    // Sin find() adicional: el cache sigue sirviendo.
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('getUuid devuelve null para un par action/resource inexistente', async () => {
    const { service } = makeService();
    await service.buildCache();

    expect(service.getUuidSync('DELETE', 'nonexistent')).toBeNull();
  });

  it('invalidate() obliga a reconstruir el índice', async () => {
    const { service, find } = makeService();

    await service.getUuid('READ', 'incidents');
    expect(find).toHaveBeenCalledTimes(1);

    service.invalidate();
    await service.getUuid('READ', 'incidents');
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('getNamesByUuids ignora ids desconocidos sin lanzar', async () => {
    const { service } = makeService();

    await expect(
      service.getNamesByUuids(['aaaaaaaa-0000-0000-0000-000000000001', 'no-existe']),
    ).resolves.toEqual(['READ incidents']);
  });
});