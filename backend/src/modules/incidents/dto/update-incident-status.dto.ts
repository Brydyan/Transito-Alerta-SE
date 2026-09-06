import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { IncidentStatus } from '../../../entities/incident.entity';
import { ALLOWED_STATUSES } from '../incident-state-machine';

/**
 * F1 (sc-315 — fix-incident-state-machine) — el DTO admite `closed`
 * como destino válido y un campo opcional `closed_reason` obligatorio
 * en la transición a `closed` (D4 del design). El servicio valida la
 * presencia de `closed_reason` cuando `status === 'closed'`; el DTO
 * sólo declara el shape.
 *
 * sc-315 W1 (ronda 2) — `@IsIn` consume `ALLOWED_STATUSES` en vez de
 * un arreglo literal. Si la máquina gana un quinto estado, el DTO lo
 * acepta sin tocar este archivo; antes, alguien tenía que recordar
 * actualizar ambos lados en lockstep.
 */
export class UpdateIncidentStatusDto {
  @IsIn([...ALLOWED_STATUSES])
  status!: IncidentStatus;

  /**
   * Motivo del cierre. Obligatorio cuando `status === 'closed'`; el
   * servicio rechaza con 422 si falta (R-FIXED-1 — D4 del design).
   * Libre (texto), limitado a 1.000 caracteres para no abusar del
   * campo y mantenerlo consultable desde la fila sin recorrido al
   * historial.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  closed_reason?: string;
}
