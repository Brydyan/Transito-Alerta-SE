import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { IncidentPriority } from '../../../entities/incident.entity';

export class CreateIncidentCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  /**
   * sc-334-adjacent (T7.4) — optional free-text description surfaced in
   * the admin form. Not exposed via /api/menus/my or /api/incidents.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;

  /**
   * 2026-09-22-sc-subcategory-priority-assignment. Optional at DTO
   * level; the service layer rejects sub-categories that omit it
   * (`parent_id` set without `priority`). Root categories always store
   * NULL regardless of what the client sends.
   *
   * `IncidentPriority` is a TS `type` alias (not a real enum), so we
   * validate with `@IsIn` against the same string set used by
   * `CreateIncidentDto.priority` (D2 — reuse existing vocabulary).
   */
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: IncidentPriority;
}
