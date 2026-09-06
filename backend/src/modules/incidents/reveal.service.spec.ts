import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { AuditService } from '../audit/audit.service';
import { IncidentsRepository, IncidentRow } from './incidents.repository';
import { RevealService } from './reveal.service';

/**
 * AUD (sc-327) — C.7 + C.8 + C.9: specs del `RevealService`.
 *
 * - C.7: la concesión de REVEAL a master es una migración
 *   (la verifica el e2e con la BD). Acá probamos la lógica
 *   del servicio.
 * - C.8: una revelación registra en `audit_events` con
 *   `actor_id`, `action='REVEAL'`, `resource_type='incidents'`,
 *   el id de la incidencia, el id del master y la
 *   justificación. La incidencia no anónima devuelve 404.
 * - C.9: la forma que emite el servicio (lo que el
 *   controller pasa a `SnakeCaseResponseInterceptor` y
 *   termina en el wire) tiene `incident_id` (snake_case) y
 *   un objeto `reporter` con `id`, `email`, `first_name`.
 */
describe('RevealService (AUD sc-327 — C.7/C.8/C.9)', () => {
  let repo: jest.Mocked<IncidentsRepository>;
  let audit: { record: jest.Mock };
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let service: RevealService;

  const MASTER_ID = 'master-uuid';
  const INCIDENT_ID = 'inc-uuid';
  const REPORTER_ID = 'reporter-uuid';

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<IncidentsRepository>;
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    // La transacción ejecuta la callback con un manager que
    // expone `query` — la callback recibe eso. Las queries
    // concretas (lookup de la incidencia, lookup del autor)
    // las configuramos por test.
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn().mockImplementation(async (fn) => {
        const manager = { query: jest.fn() };
        return fn(manager);
      }),
    };
    service = new RevealService(
      repo as unknown as IncidentsRepository,
      audit as unknown as AuditService,
      dataSource as unknown as DataSource,
    );
  });

  function mockManagerQuery(incidentRow: IncidentRow | null, reporter: { id: string; email: string | null; first_name: string | null } | null) {
    (dataSource.transaction as jest.Mock).mockImplementation(async (fn) => {
      const manager = {
        query: jest
          .fn()
          // Primer query: lookup de la incidencia.
          .mockResolvedValueOnce(incidentRow ? [incidentRow] : [])
          // Segundo query: lookup del autor.
          .mockResolvedValueOnce(reporter ? [reporter] : []),
      };
      return fn(manager);
    });
  }

  function makeIncident(isAnonymous: boolean): IncidentRow {
    return {
      id: INCIDENT_ID,
      title: 'Reporte',
      description: null,
      status: 'pending',
      priority: 'medium',
      citizen_id: isAnonymous ? 'mask-uuid' : REPORTER_ID,
      is_anonymous: isAnonymous,
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
    };
  }

  it('C.8: revel de una anónima registra en audit_events con actor, action, resource, justification', async () => {
    mockManagerQuery(
      makeIncident(true),
      { id: REPORTER_ID, email: 'autor@example.com', first_name: 'Ada' },
    );

    const result = await service.reveal(INCIDENT_ID, MASTER_ID, {
      justification: 'Denuncia por información falsa con contexto',
    });

    // C.9: la forma del servicio. El `SnakeCaseResponseInterceptor`
    // reescribe la salida del controller, pero la forma que el
    // servicio retorna ya viene en snake_case para que la
    // transformación del interceptor sea un no-op.
    expect(result).toEqual({
      incident_id: INCIDENT_ID,
      reporter: {
        id: REPORTER_ID,
        email: 'autor@example.com',
        first_name: 'Ada',
      },
    });

    // La auditoría se invocó con los campos correctos.
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: MASTER_ID,
        action: 'REVEAL',
        resourceType: 'incidents',
        resourceId: INCIDENT_ID,
        justification: 'Denuncia por información falsa con contexto',
      }),
      expect.anything(), // manager
    );
  });

  it('C.8: case_ref opcional se persiste en metadata.case_ref', async () => {
    mockManagerQuery(
      makeIncident(true),
      { id: REPORTER_ID, email: 'autor@example.com', first_name: 'Ada' },
    );

    await service.reveal(INCIDENT_ID, MASTER_ID, {
      justification: 'Folio interno 2026/045 con detalles completos',
      caseRef: 'FOLIO-2026-045',
    });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { case_ref: 'FOLIO-2026-045' },
      }),
      expect.anything(),
    );
  });

  it('C.8: case_ref ausente → metadata {} (no se persiste la clave)', async () => {
    mockManagerQuery(
      makeIncident(true),
      { id: REPORTER_ID, email: 'autor@example.com', first_name: 'Ada' },
    );

    await service.reveal(INCIDENT_ID, MASTER_ID, {
      justification: 'Folio interno 2026/045 con detalles completos',
    });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: {} }),
      expect.anything(),
    );
  });

  it('C.8: dos revelaciones producen dos registros (no se consolidan)', async () => {
    // La regla "cada revelación cuenta" (D4) se enforce por
    // construcción: cada llamada a `service.reveal` inserta
    // una fila nueva en `audit_events`. Si alguien refactoriza
    // para cachear/deduplicar, este test cae.
    const manager1 = {
      query: jest
        .fn()
        .mockResolvedValueOnce([makeIncident(true)])
        .mockResolvedValueOnce([{ id: REPORTER_ID, email: 'a@b', first_name: 'X' }]),
    };
    const manager2 = {
      query: jest
        .fn()
        .mockResolvedValueOnce([makeIncident(true)])
        .mockResolvedValueOnce([{ id: REPORTER_ID, email: 'a@b', first_name: 'X' }]),
    };
    (dataSource.transaction as jest.Mock)
      .mockImplementationOnce(async (fn) => fn(manager1))
      .mockImplementationOnce(async (fn) => fn(manager2));

    await service.reveal(INCIDENT_ID, MASTER_ID, {
      justification: 'Primera revelación con justificación válida',
    });
    await service.reveal(INCIDENT_ID, MASTER_ID, {
      justification: 'Segunda revelación con otra justificación',
    });

    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it('C.8: la incidencia no existe → 404', async () => {
    mockManagerQuery(null, null);

    await expect(
      service.reveal('missing', MASTER_ID, {
        justification: 'Justificación suficiente para pasar el MinLength',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // No se escribió auditoría si no había nada que revelar.
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('C.8: la incidencia no es anónima → 404 (D4, "Incidencia no anónima")', async () => {
    // La diferencia entre "no existe" y "no es anónima" no
    // se distingue al cliente — ambas devuelven 404. Eso es
    // intencional: filtrar la existencia de la incidencia
    // anula el propósito de devolver 404.
    mockManagerQuery(makeIncident(false), null);

    await expect(
      service.reveal(INCIDENT_ID, MASTER_ID, {
        justification: 'Justificación suficiente para pasar el MinLength',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('C.8: la auditoría y el lookup del autor viven en la misma transacción', async () => {
    // La regla D2 — "una acción cuyo rastro no se pudo
    // guardar no debe quedar hecha". Si `audit.record` lanza,
    // la promesa rechaza; el `dataSource.transaction` se
    // encarga del rollback automático de la query del autor
    // (que ya corrió dentro de la misma tx).
    mockManagerQuery(
      makeIncident(true),
      { id: REPORTER_ID, email: 'autor@example.com', first_name: 'Ada' },
    );
    const auditError = new Error('audit write failed');
    audit.record.mockRejectedValueOnce(auditError);

    await expect(
      service.reveal(INCIDENT_ID, MASTER_ID, {
        justification: 'Justificación suficiente para pasar el MinLength',
      }),
    ).rejects.toBe(auditError);
  });

  it('C.7: listReveals devuelve el historial ordenado por created_at asc', async () => {
    // `listReveals` consulta directamente `audit_events`; no
    // pasa por la transacción de `reveal` (es una lectura
    // pura). Mockeamos la query y verificamos el shape.
    const row1 = {
      revealed_by: 'master-1',
      revealed_at: new Date('2026-09-01T00:00:00Z'),
      justification: 'Justificación primera de la primera revelación',
      case_ref: 'FOLIO-1',
    };
    const row2 = {
      revealed_by: 'master-2',
      revealed_at: new Date('2026-09-02T00:00:00Z'),
      justification: 'Justificación segunda de la segunda revelación',
      case_ref: null,
    };
    dataSource.query.mockResolvedValueOnce([row1, row2]);

    const result = await service.listReveals(INCIDENT_ID);

    expect(result).toEqual([row1, row2]);
    // La query filtra por action='REVEAL' y resource_type='incidents'.
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain("action = 'REVEAL'");
    expect(sql).toContain("resource_type = 'incidents'");
    expect(params).toEqual([INCIDENT_ID]);
  });

  it('C.7: listReveals con case_ref null lo devuelve como null (no como undefined)', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        revealed_by: 'm',
        revealed_at: new Date(),
        justification: 'Justificación válida que pasa el MinLength de 20',
        case_ref: null,
      },
    ]);

    const result = await service.listReveals(INCIDENT_ID);

    expect(result[0].case_ref).toBeNull();
  });

  it('WARNING-4: incidencia anónima SIN fila en incident_reporters → InternalServerErrorException con code ANONYMOUS_AUTHORSHIP_MISSING', async () => {
    // El servicio distingue "data bug" (incidencia marcada
    // como anónima sin sello) de "not found" (incidencia
    // inexistente). El primero es un 500 con código
    // tipado; el segundo es un 404. Antes del fix el
    // servicio lanzaba `new Error(...)` que NestJS
    // convertía en 500 plano sin código — el operador
    // recibía un mensaje genérico y no podía distinguir
    // entre "el reportero rompió la BD" y "el reporte no
    // existe".
    mockManagerQuery(makeIncident(true), null);

    await expect(
      service.reveal(INCIDENT_ID, MASTER_ID, {
        justification: 'Justificación suficiente para pasar el MinLength',
      }),
    ).rejects.toMatchObject({
      // `InternalServerErrorException` no es NotFound; el
      // `toBeInstanceOf` en línea abajo lo verifica.
      response: expect.objectContaining({ code: 'ANONYMOUS_AUTHORSHIP_MISSING' }),
    });
    await expect(
      service.reveal(INCIDENT_ID, MASTER_ID, {
        justification: 'Justificación suficiente para pasar el MinLength',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    // No se escribió auditoría: la inconsistencia de datos
    // no debe contaminar el registro.
    expect(audit.record).not.toHaveBeenCalled();
  });
});
