import {
  IsBoolean,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { IncidentPriority } from '../../../entities/incident.entity';

export class CreateIncidentDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: IncidentPriority;

  /**
   * AUD (sc-327) D1 — `true` para publicación anónima. Si es
   * `true`, la autoría se sella: `incidents.citizen_id` apunta
   * a la máscara (`users.device_uuid = 'anonymous'`) y el
   * autor real queda registrado en `incident_reporters`,
   * accesible sólo vía `REVEAL incidents`.
   *
   * Default: `false` (publicación normal). El cliente
   * (`@IsOptional`) puede omitir el campo para conservar
   * la conducta preexistente.
   */
  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean;
}
