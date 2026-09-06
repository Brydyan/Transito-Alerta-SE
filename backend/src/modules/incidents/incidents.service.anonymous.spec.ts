import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

/**
 * AUD (sc-327) — B.5 + B.6: specs de la autoría sellada.
 *
 * B.5 cubre el camino feliz: `is_anonymous=true` redirige
 * `citizen_id` a la máscara y crea la fila en
 * `incident_reporters` en la misma transacción. `false`
 * deja `citizen_id` apuntando al autor real y no crea
 * ninguna fila.
 *
 * B.6 es la red contra el defecto recurrente: una ruta
 * que se añada mañana y olvide el contrato de
 * "anónimo = no exponer al autor real" debe fallar un
 * test. Aquí verificamos que la fila del autor real
 * nunca aparece en el resultado de `create` (y por
 * construcción, en ningún `find*` porque el repo no la
 * carga — `eager: false`).
 */
describe('IncidentsService (AUD sc-327 — B.5/B.6 anonymous sealing)', () => {
  let repo: jest.Mocked<IncidentsRepository>;
  let geofencing: { resolveZone: jest.Mock; purgeZoneCache: jest.Mock; tagCacheKey: jest.Mock };
  let organizations: { findNotifiedFor: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let redis: { xadd: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let configService: { get: jest.Mock };
  let service: IncidentsService;

  const MASK_ID = 'mask-row-uuid';
  const AUTHOR_ID = 'author-row-uuid';

  function makeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'inc-1',
      title: 'Pothole',
      description: null,
      status: 'pending',
      priority: 'medium',
      citizen_id: AUTHOR_ID,
      is_anonymous: true,
      assigned_to: null,
      zone_id: 'zone-1',
      geofence_matched: true,
      organization_id: 'org-1',
      category_id: null,
      claimed_by: null,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      closed_reason: null,
      lat: -2.2,
      lng: -80.8,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
      claimed_at: null,
      resolution_date: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<IncidentsRepository>;
    geofencing = { resolveZone: jest.fn(), purgeZoneCache: jest.fn(), tagCacheKey: jest.fn() };
    organizations = { findNotifiedFor: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    redis = { xadd: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    // `transaction` recibe una callback y la ejecuta con
    // un `manager` que expone `query`. La callback devuelve
    // lo que devuelve el INSERT.
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn().mockImplementation(async (fn) =>
        fn({ query: jest.fn().mockResolvedValue([]) }),
      ),
    };
    configService = {
      get: jest.fn().mockReturnValue({ anonymousDeviceUuid: 'anonymous' }),
    };
    service = new IncidentsService(
      repo as unknown as IncidentsRepository,
      // `any` para los mocks de servicios adyacentes: el
      // spec no necesita el tipo real (sólo usa
      // `resolveZone` / `findNotifiedFor` / `emit` /
      // `xadd` / cache), y la forma detallada agrega ruido
      // sin información.
      geofencing as any,
      organizations as any,
      eventEmitter as any,
      redis as any,
      cache as any,
      dataSource as unknown as DataSource,
      configService as unknown as ConfigService,
    );

    geofencing.resolveZone.mockResolvedValue({ zone_id: 'zone-1', zone: { id: 'zone-1' } });
    organizations.findNotifiedFor.mockResolvedValue([
      { id: 'org-1', name: 'Org 1', zone_id: 'zone-1', created_at: new Date() },
    ]);
  });

  it('B.5: is_anonymous=true → citizen_id apunta a la máscara, fila en incident_reporters, misma transacción', async () => {
    // El lookup de la máscara se hace sobre el `dataSource`
    // (no sobre el manager: ocurre antes de abrir la
    // transacción).
    dataSource.query.mockResolvedValueOnce([{ id: MASK_ID }]);
    // El INSERT de la fila de autoría usa el `manager.query`
    // dentro de la transacción.
    const txManagerQuery = jest.fn().mockResolvedValue([]);
    dataSource.transaction.mockImplementation(async (fn) =>
      fn({ query: txManagerQuery }),
    );
    repo.create.mockResolvedValue(
      makeRow({ citizen_id: MASK_ID, is_anonymous: true }) as never,
    );

    const result = await service.create(
      {
        title: 'Reporte anónimo',
        lat: -2.2,
        lng: -80.8,
        is_anonymous: true,
      } as unknown as Parameters<typeof service.create>[0],
      AUTHOR_ID,
    );

    // citizen_id de la incidencia resultante es la MÁSCARA,
    // no el autor real.
    expect(result.citizen_id).toBe(MASK_ID);
    expect(result.is_anonymous).toBe(true);
    // El lookup de la máscara se hizo con el `device_uuid`
    // configurado (no se hardcodeó).
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM users'),
      ['anonymous'],
    );
    // La fila de autoría se insertó en la misma transacción:
    // el `manager.query` se invocó con el INSERT a
    // incident_reporters, con el id de la incidencia
    // devuelta por `repo.create` y el AUTHOR_ID.
    expect(txManagerQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO incident_reporters'),
      ['inc-1', AUTHOR_ID],
    );
  });

  it('B.5: is_anonymous=true pero la máscara no existe → lanza (operador debe correr 0001 + 0048)', async () => {
    dataSource.query.mockResolvedValueOnce([]); // mask lookup returns nothing

    await expect(
      service.create(
        { title: 'x', lat: -2.2, lng: -80.8, is_anonymous: true } as never,
        AUTHOR_ID,
      ),
    ).rejects.toThrow(/mask row not found/);
    // No se intentó abrir transacción: la guarda de pre-condición
    // corre antes.
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('B.5: is_anonymous=false → citizen_id es el autor, NO se crea fila en incident_reporters', async () => {
    repo.create.mockResolvedValue(
      makeRow({ citizen_id: AUTHOR_ID, is_anonymous: false }) as never,
    );

    const result = await service.create(
      {
        title: 'Normal',
        lat: -2.2,
        lng: -80.8,
        is_anonymous: false,
      } as unknown as Parameters<typeof service.create>[0],
      AUTHOR_ID,
    );

    // Sin máscara ni transacción: la rama rápida, sin
    // costo adicional sobre el camino público normal.
    expect(result.citizen_id).toBe(AUTHOR_ID);
    expect(result.is_anonymous).toBe(false);
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('B.5: is_anonymous omitido → default false (compatibilidad hacia atrás)', async () => {
    // El DTO declara `is_anonymous?` como opcional. Si el
    // cliente (legacy o nueva ruta que no conoce el campo)
    // omite el campo, el comportamiento es el preexistente:
    // publicación normal, sin máscara, sin transacción.
    repo.create.mockResolvedValue(
      makeRow({ citizen_id: AUTHOR_ID, is_anonymous: false }) as never,
    );

    const result = await service.create(
      {
        title: 'Sin flag',
        lat: -2.2,
        lng: -80.8,
      } as unknown as Parameters<typeof service.create>[0],
      AUTHOR_ID,
    );

    expect(result.citizen_id).toBe(AUTHOR_ID);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('B.6: el resultado de create NO contiene el id del autor real (sólo la máscara)', async () => {
    // WARNING-B (ronda 12) — el docstring original afirmaba
    // que este test cazaba "el patrón regla a medias" del
    // proyecto. La realidad, sin embargo, es que el test
    // hardcodea la respuesta del mock (`makeRow({citizen_id:
    // MASK_ID})`) — pasa aunque el servicio pase `AUTHOR_ID` a
    // `repo.create`. La defensa real vive en los dos tests
    // B.5 hermanos ("is_anonymous=true con citizen_id=mask y
    // fila en incident_reporters" y "el fallo del INSERT …
    // hace rollback"), que sí inspeccionan los argumentos
    // pasados al repo. Lo que este test prueba, hoy, es:
    //  - el servicio INVOCA `repo.create` con `isAnonymous: true`
    //    (cambio en el contrato de `CreateIncidentInput`),
    //  - el resultado final que el service devuelve NO tiene
    //    `citizen_id = AUTHOR_ID` por accidente (red de
    //    seguridad contra una mutación de `result.citizen_id`
    //    posterior al mock).
    //
    // Para cazar "regla a medias" en serio, mirá
    // `repo.create.mock.calls[0][0]` — la trenza entre este
    // test y los B.5 no es redundante: cubren la respuesta
    // del servicio y los argumentos al repo, dos lados de
    // la misma frontera.
    dataSource.query.mockResolvedValueOnce([{ id: MASK_ID }]);
    const txManagerQuery = jest.fn().mockResolvedValue([]);
    dataSource.transaction.mockImplementation(async (fn) =>
      fn({ query: txManagerQuery }),
    );
    repo.create.mockResolvedValue(
      makeRow({ citizen_id: MASK_ID, is_anonymous: true }) as never,
    );

    const result = await service.create(
      { title: 'x', lat: -2.2, lng: -80.8, is_anonymous: true } as never,
      AUTHOR_ID,
    );

    expect(result.citizen_id).toBe(MASK_ID);
    expect(result.citizen_id).not.toBe(AUTHOR_ID);
    // WARNING-B: el servicio debe pedir al repo que cree
    // con `isAnonymous: true`. Si alguien refactoriza y la
    // `is_anonymous` se omite, el INSERT pone la columna en
    // `false` (default de la BD) y la regla "el autor de un
    // anónimo nunca aparece en la respuesta" se rompe: la
    // respuesta ahora expone al autor real.
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        isAnonymous: true,
        citizenId: MASK_ID,
      }),
      expect.anything(),
    );
  });

  it('B.6: el fallo del INSERT de incident_reporters hace rollback de la incidencia', async () => {
    // D2 del diseño — "una acción cuyo rastro no se pudo
    // guardar no debe quedar hecha". El `manager.query`
    // falla en el INSERT de `incident_reporters`; la
    // promesa de la transacción rechaza y el `repo.create`
    // NO persiste nada (su query vivía dentro del mismo
    // manager, vía `getRepository().save`, y la misma
    // transacción la aborta). Como acá mockeamos
    // `repo.create` en lugar de la query real, verificamos
    // que la transacción se llamó y propagó el error.
    //
    // FIX-1 (ronda 11): además de la propagación, el test
    // afirma que `repo.create` se invoca CON el `manager`
    // de la transacción. Si alguien refactoriza para pasar
    // `undefined` (volviendo al bug pre-FIX-1), este
    // `toHaveBeenCalledWith(..., expect.anything())` lo
    // detecta: la query vuelve a correr contra
    // `this.dataSource.query` y la fila queda huérfana.
    dataSource.query.mockResolvedValueOnce([{ id: MASK_ID }]);
    // `repo.create` se invoca DENTRO de la transacción. Si
    // devuelve una fila, la siguiente operación
    // (manager.query con INSERT) será la que falle.
    repo.create.mockResolvedValue(makeRow() as never);
    const txError = new Error('incident_reporters insert failed');
    const txManagerQuery = jest.fn().mockRejectedValueOnce(txError);
    dataSource.transaction.mockImplementation(async (fn) =>
      fn({ query: txManagerQuery }),
    );

    await expect(
      service.create(
        { title: 'x', lat: -2.2, lng: -80.8, is_anonymous: true } as never,
        AUTHOR_ID,
      ),
    ).rejects.toBe(txError);

    // FIX-1 (ronda 11) — `repo.create` se invoca CON un
    // segundo argumento (el `manager` de la transacción), no
    // con uno solo. Si alguien refactoriza para volver al
    // bug pre-fix (query contra `this.dataSource`, fuera de
    // la transacción), el `expect.anything()` lo caza: la
    // segunda posición sería `undefined` y este assert cae.
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ isAnonymous: true }),
      expect.anything(),
    );
  });
});
