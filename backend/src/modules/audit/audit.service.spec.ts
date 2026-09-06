import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditEventEntity } from '../../entities/audit-event.entity';
import { AuditService } from './audit.service';

/**
 * AUD (sc-327) — A.3/A.4/A.5: el `AuditService` tiene una sola
 * operación pública (`record`), no expone `update` ni `delete`,
 * y la escritura participa de la transacción de la acción
 * auditada (D4): si la auditoría falla, la acción se revierte.
 *
 * Aserciones de igualdad donde el contrato exige igualdad
 * (`toBe` sobre el `id` que devuelve la operación). La forma
 * del `metadata` se valida con `toEqual({})` por defecto — el
 * campo es libre en el esquema pero el contrato del servicio
 * es "toda metadata es opcional y se omite cuando no hay".
 */
describe('AuditService (AUD sc-327 — D3/D4)', () => {
  let service: AuditService;
  let repo: jest.Mocked<Repository<AuditEventEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditEventEntity),
          useValue: {
            create: jest.fn().mockImplementation((e) => ({ ...e })),
            save: jest.fn().mockImplementation(async (e) => ({
              id: 'audit-1',
              ...e,
              createdAt: new Date(),
            })),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuditService);
    repo = moduleRef.get(getRepositoryToken(AuditEventEntity));
  });

  it('A.3+A.4: record() persiste el evento con todos los campos', async () => {
    const saved = await service.record({
      actorId: 'user-1',
      action: 'REVEAL',
      resourceType: 'incidents',
      resourceId: 'inc-1',
      justification: 'Denuncia por información falsa',
      metadata: { source: 'admin_panel' },
    });

    expect(repo.create).toHaveBeenCalledWith({
      actorId: 'user-1',
      action: 'REVEAL',
      resourceType: 'incidents',
      resourceId: 'inc-1',
      justification: 'Denuncia por información falsa',
      metadata: { source: 'admin_panel' },
    });
    expect(repo.save).toHaveBeenCalled();
    expect(saved.id).toBe('audit-1');
    expect(saved.action).toBe('REVEAL');
  });

  it('A.3: el servicio NO expone update ni delete', () => {
    // Garantía estructural: el servicio sólo tiene `record`.
    // Si alguien añade un método de modificación, este test
    // falla y obliga a re-pensar la inmutabilidad del registro.
    const proto = Object.getPrototypeOf(service);
    const methods = Object.getOwnPropertyNames(proto).filter(
      (m) => m !== 'constructor' && typeof (service as unknown as Record<string, unknown>)[m] === 'function',
    );
    expect(methods).toEqual(['record']);
  });

  it('A.4: record() sin manager usa el repo por defecto (sin transacción del llamador)', async () => {
    // Cuando el llamador NO pasa un `manager`, la escritura
    // usa el repo inyectado. La acción auditada ya pasó; un
    // fallo de `save` aquí no la revierte (la regla de
    // "transacción compartida" aplica SÓLO cuando el llamador
    // decide compartirla).
    await service.record({
      actorId: 'user-1',
      action: 'REVEAL',
      resourceType: 'incidents',
      resourceId: 'inc-1',
    });
    expect(repo.save).toHaveBeenCalled();
  });

  it('A.4: record() con manager usa el repo del EntityManager (transacción compartida)', async () => {
    // La acción que está siendo auditada pasa su `manager`
    // para que el INSERT de auditoría viva en la misma
    // transacción. Si el INSERT falla, la acción hace
    // rollback. La verificación: el `save` se invoca contra
    // el manager.getRepository(), NO contra `this.repo`.
    const managerEntity: AuditEventEntity = {
      id: 'audit-1',
      actor: null as unknown as AuditEventEntity['actor'],
      actorId: 'user-1',
      action: 'REVEAL',
      resourceType: 'incidents',
      resourceId: 'inc-1',
      justification: 'motivo',
      metadata: {},
      createdAt: new Date(),
    };
    const managerRepo = {
      create: jest.fn().mockImplementation((e) => ({ ...e })),
      save: jest.fn().mockResolvedValue(managerEntity),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(managerRepo),
    } as unknown as Repository<AuditEventEntity>['manager'];

    await service.record(
      {
        actorId: 'user-1',
        action: 'REVEAL',
        resourceType: 'incidents',
        resourceId: 'inc-1',
      },
      manager,
    );

    expect(manager.getRepository).toHaveBeenCalledWith(AuditEventEntity);
    expect(managerRepo.save).toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('A.5: si la escritura falla, el error se propaga (la acción NO debe quedar hecha)', async () => {
    // El contrato es "se audita lo ocurrido, no lo intentado":
    // un fallo de la auditoría es un fallo de la acción. El
    // servicio NO traga la excepción.
    repo.save.mockRejectedValueOnce(new Error('audit db down'));
    await expect(
      service.record({
        actorId: 'user-1',
        action: 'REVEAL',
        resourceType: 'incidents',
        resourceId: 'inc-1',
      }),
    ).rejects.toThrow('audit db down');
  });

  it('metadata default es {} cuando el llamador omite el campo', async () => {
    await service.record({
      actorId: 'user-1',
      action: 'REVEAL',
      resourceType: 'incidents',
      resourceId: 'inc-1',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: {} }),
    );
  });

  it('resourceId default es null cuando el llamador omite el campo', async () => {
    await service.record({
      actorId: 'user-1',
      action: 'CLEANUP',
      resourceType: 'cache',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: null }),
    );
  });

  it('justification default es null cuando el llamador omite el campo', async () => {
    // La obligatoriedad por acción se enforce en el llamador
    // (no en el servicio). El servicio acepta eventos sin
    // justification: una acción de sólo lectura podría no
    // necesitarla (D3).
    await service.record({
      actorId: 'user-1',
      action: 'READ',
      resourceType: 'incidents',
      resourceId: 'inc-1',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ justification: null }),
    );
  });
});
