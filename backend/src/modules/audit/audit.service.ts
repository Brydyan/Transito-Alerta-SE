import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditEventEntity } from '../../entities/audit-event.entity';

/**
 * AUD (sc-327) — D3: el `AuditService` expone una sola
 * operación pública: `record(...)`. No `update`, no `delete`. Un
 * registro de auditoría editable no es un registro de auditoría.
 *
 * El método acepta un `manager` opcional para que el llamador
 * comparta la transacción con la acción auditada (D4). Si el
 * llamador no provee uno, se usa el `manager` por defecto del
 * repositorio — pero la práctica correcta es que TODA
 * escritura de auditoría viva dentro de la misma transacción
 * que la acción que la origina. Una acción cuyo rastro no se
 * pudo guardar no debe quedar hecha.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditEventEntity)
    private readonly repo: Repository<AuditEventEntity>,
  ) {}

  /**
   * Inserta un registro de auditoría. El `manager` opcional
   * permite compartir la transacción con la acción auditada
   * (D4). El `metadata` por defecto es `{}` — el contrato
   * es "toda metadata es opcional" y se serializa como jsonb.
   *
   * Lanza si la escritura falla. La convención es que el
   * llamador NO trague esta excepción: si el `manager` es el
   * de la transacción de la acción, la falla del INSERT
   * hace rollback de la acción. La regla de D4: "se audita
   * lo ocurrido, no lo intentado".
   */
  async record(
    input: {
      actorId: string;
      action: string;
      resourceType: string;
      resourceId?: string | null;
      justification?: string | null;
      metadata?: Record<string, unknown>;
    },
    manager?: Repository<AuditEventEntity>['manager'],
  ): Promise<AuditEventEntity> {
    const repo = manager ? manager.getRepository(AuditEventEntity) : this.repo;
    const entity = repo.create({
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      justification: input.justification ?? null,
      metadata: input.metadata ?? {},
    });
    const saved = await repo.save(entity);
    return saved;
  }
}
